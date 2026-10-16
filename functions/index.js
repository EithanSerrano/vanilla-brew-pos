// GCash gateway via PayMongo Checkout Sessions.
// Secrets (never put these in the app):
//   firebase functions:secrets:set PAYMONGO_SECRET_KEY
//   firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET
const crypto = require('crypto');
const admin = require('firebase-admin');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

const PAYMONGO_SECRET_KEY = defineSecret('PAYMONGO_SECRET_KEY');
const PAYMONGO_WEBHOOK_SECRET = defineSecret('PAYMONGO_WEBHOOK_SECRET');
const API = 'https://api.paymongo.com/v1';

// Cashier app calls this to start a GCash payment. Returns a checkout URL to show as a QR code.
exports.createGcashPayment = onCall({ secrets: [PAYMONGO_SECRET_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');

  const amount = Number(request.data?.amount);
  const reference = String(request.data?.reference || '').slice(0, 60);
  if (!Number.isFinite(amount) || amount < 20 || amount > 100000) {
    throw new HttpsError('invalid-argument', 'Amount must be between PHP 20 and PHP 100,000.');
  }

  const centavos = Math.round(amount * 100);
  const res = await fetch(`${API}/checkout_sessions`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY.value()}:`).toString('base64')}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: false,
          description: reference || 'Vanilla Brew order',
          payment_method_types: ['gcash'],
          line_items: [{ currency: 'PHP', amount: centavos, name: 'Vanilla Brew order', quantity: 1 }],
          reference_number: reference || undefined,
          metadata: { cashierUid: request.auth.uid },
        },
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('PayMongo error', res.status, JSON.stringify(body));
    throw new HttpsError('internal', 'Could not create GCash payment.');
  }

  const session = body.data;
  const paymentId = session.id;
  await db.collection('gcashPayments').doc(paymentId).set({
    status: 'pending',
    amount,
    reference,
    cashierUid: request.auth.uid,
    checkoutUrl: session.attributes.checkout_url,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { paymentId, checkoutUrl: session.attributes.checkout_url };
});

// PayMongo webhook: register https://<region>-<project>.cloudfunctions.net/paymongoWebhook
// for the `checkout_session.payment.paid` event.
exports.paymongoWebhook = onRequest({ secrets: [PAYMONGO_WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // Signature header: t=<timestamp>,te=<test sig>,li=<live sig>
  const header = String(req.get('Paymongo-Signature') || '');
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto
    .createHmac('sha256', PAYMONGO_WEBHOOK_SECRET.value())
    .update(`${parts.t}.${req.rawBody.toString('utf8')}`)
    .digest('hex');
  const provided = parts.li || parts.te || '';
  const valid =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!valid) return res.status(400).send('Invalid signature');

  const event = req.body?.data?.attributes;
  if (event?.type === 'checkout_session.payment.paid') {
    const session = event.data;
    const ref = db.collection('gcashPayments').doc(session.id);
    await ref.set(
      {
        status: 'paid',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paymongoPaymentId: session.attributes?.payments?.[0]?.id || null,
      },
      { merge: true }
    );
  }
  return res.status(200).send('ok');
});
