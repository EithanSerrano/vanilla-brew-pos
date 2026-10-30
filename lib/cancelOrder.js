import { addDoc, collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Mirrors the SMS dashboard's cancelOngoingSale (src/utils/inventoryDeduction.js) so a
// cancel from the POS and one from the dashboard leave identical records.

export const CANCEL_REASONS = ['Customer changed mind', 'Wrong order entered', 'Item unavailable', 'Long wait time', 'Other'];

const pad2 = (n) => String(n).padStart(2, '0');
const formatTransactionDate = (d = new Date()) =>
  `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${String(d.getFullYear()).slice(-2)}`;

// Same key scheme as the dashboard: SLS-MMDDYY-001, numbered per day
const saveTransaction = async (prefix, data) => {
  const now = new Date();
  const dayPrefix = `${prefix}-${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${String(now.getFullYear()).slice(-2)}-`;
  const snap = await getDocs(collection(db, 'transactions'));
  const count = snap.docs.filter((d) => d.id.startsWith(dayPrefix)).length;
  const transNo = `${dayPrefix}${String(count + 1).padStart(3, '0')}`;
  await setDoc(doc(db, 'transactions', transNo), { transNo, ...data, createdAt: now });
  return transNo;
};

// Put the stock of a sale back into the batches it was taken from.
const restoreInventoryForSale = async (sale) => {
  const restored = [];
  for (const d of sale.stockDeductions || []) {
    if (d.type === 'ingredient') {
      const ref = doc(db, 'ingredients', d.refId);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const batches = (snap.data().batches || []).map((b) => ({ ...b }));
      for (const taken of d.batches || []) {
        const batch = batches.find((b) => b.batchId && b.batchId === taken.batchId);
        if (batch) batch.quantity = (batch.quantity || 0) + taken.quantity;
        else if (batches.length) batches[0].quantity = (batches[0].quantity || 0) + taken.quantity;
      }
      await updateDoc(ref, { batches, lastUpdated: new Date() });
      restored.push({ name: d.name, restored: d.deducted, unit: d.unit });
    } else if (d.type === 'material') {
      const ref = doc(db, 'materials', d.refId);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const back = d.taken ?? d.deducted;
      await updateDoc(ref, { stock: (snap.data().stock ?? 0) + back, lastUpdated: new Date() });
      restored.push({ name: d.name, restored: back, unit: d.unit });
    }
  }
  return restored;
};

// Cancel an Ongoing order: mark it Canceled with a reason and return its stock.
// stockRestored is false when the sale has no deduction record (stock was never taken,
// or the sale predates the record).
export const cancelOngoingSale = async (saleId, { reason, canceledBy }) => {
  const ref = doc(db, 'salestransaction', saleId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order not found.');
  const sale = { id: snap.id, ...snap.data() };
  if (sale.status !== 'Ongoing') throw new Error('Only Ongoing orders can be canceled.');

  const hasRecord = Array.isArray(sale.stockDeductions) && sale.stockDeductions.length > 0;
  const restored = hasRecord ? await restoreInventoryForSale(sale) : [];

  await updateDoc(ref, {
    status: 'Canceled',
    cancelReason: reason,
    canceledBy,
    canceledAt: new Date(),
    stockRestored: hasRecord,
    // No deduction yet (the SMS was closed when the order came in): make sure it never happens.
    ...(hasRecord ? {} : { stockDeducted: true }),
  });

  const number = sale.transactionNumber || sale.id;
  const summary = restored.map((r) => `${r.name} +${r.restored}${r.unit ? ' ' + r.unit : ''}`).join(', ');

  // The order is already canceled; a failed log write must not report the cancel as failed
  try {
    await saveTransaction('SLS', {
      type: 'Sales',
      action: 'OrderCanceled',
      saleId: sale.id,
      transactionNumber: number,
      reason,
      canceledBy,
      restored,
      summary: `Order ${number} canceled by ${canceledBy} (${reason}).${summary ? ` Stock restored: ${summary}` : ''}`,
      date: formatTransactionDate(),
    });
  } catch (err) {
    console.error('Could not save cancel transaction record:', err);
  }
  try {
    await addDoc(collection(db, 'auditlog'), {
      action: 'CANCEL_ORDER', itemType: 'order',
      itemId: number, itemName: number,
      details: { reason, stockRestored: hasRecord },
      performedBy: canceledBy, timestamp: new Date(),
    });
  } catch (err) {
    console.error('Could not write audit log:', err);
  }

  return { restored, stockRestored: hasRecord, number };
};
