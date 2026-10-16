import Constants from 'expo-constants';
import { getApp } from 'firebase/app';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebaseConfig';

// PayMongo rejects GCash payments below PHP 20.
export const GCASH_MIN_AMOUNT = 20;

// Set expo.extra.gcashSimulate to false in app.json once the PayMongo backend is live.
export const GCASH_SIMULATED = Constants.expoConfig?.extra?.gcashSimulate !== false;
export const GCASH_PROVIDER_LABEL = GCASH_SIMULATED ? 'Simulated' : 'PayMongo';

// --- Simulation (no network, no backend) ---
const simListeners = new Map();

const simCreate = async () => {
  await new Promise((r) => setTimeout(r, 700)); // mimic network latency
  const paymentId = `sim_${Date.now()}`;
  return { paymentId, checkoutUrl: `vanillabrew://sim-gcash/${paymentId}` };
};

const simWatch = (paymentId, onChange) => {
  simListeners.set(paymentId, onChange);
  onChange('pending');
  return () => simListeners.delete(paymentId);
};

/** Simulation only: pretend the customer finished paying in GCash. */
export const simulateGcashPaid = (paymentId) => simListeners.get(paymentId)?.('paid');

// --- Real gateway ---
let createCall = null;
const getCreateCall = () => {
  if (!createCall) createCall = httpsCallable(getFunctions(getApp()), 'createGcashPayment');
  return createCall;
};

/** Creates a GCash checkout. Resolves to { paymentId, checkoutUrl }. */
export const createGcashPayment = async (amount, reference) => {
  if (GCASH_SIMULATED) return simCreate();
  const { data } = await getCreateCall()({ amount, reference });
  return data;
};

/** Calls onChange(status) as the payment changes ('pending' | 'paid'). Returns unsubscribe. */
export const watchGcashPayment = (paymentId, onChange, onError) => {
  if (GCASH_SIMULATED) return simWatch(paymentId, onChange);
  return onSnapshot(
    doc(db, 'gcashPayments', paymentId),
    (snap) => snap.exists() && onChange(snap.data().status),
    onError
  );
};
