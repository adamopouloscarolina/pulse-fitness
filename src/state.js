// App state + actions. No SDK imports here — domain logic only.
// localStorage for MVP persistence; swap for a backend or on-chain
// storage when you outgrow it.

import { getAddress, isAddress } from 'viem';
import { submitTransactions } from './bridge.js';

const STORAGE_KEY = 'circles-fitness-state-v1';

const defaultState = {
  wallet: null,
  mode: 'standalone', // 'standalone' | 'miniapp'
  status: '',
  goals: {
    calories: 2100,
    steps: 10000,
    protein: 120,
  },
  today: {
    // Demo data so the UI has something to show on first load.
    // Replace with real entries / wearable sync.
    meals: [
      { id: 'm1', name: 'Oats, banana, walnuts', kcal: 420, protein: 14, carbs: 62, fat: 14, type: 'breakfast', time: '08:20' },
      { id: 'm2', name: 'Quinoa bowl, chicken',  kcal: 680, protein: 48, carbs: 70, fat: 18, type: 'lunch',     time: '13:10' },
      { id: 'm3', name: 'Greek yogurt, berries', kcal: 320, protein: 20, carbs: 32, fat: 6,  type: 'snack',     time: '16:45' },
    ],
    workouts: [
      { id: 'w1', kind: 'Run', durationMin: 38, avgHr: 142, time: '07:15' },
    ],
    steps: 7842,
  },
  challenge: {
    title: '10k steps × 5 days',
    pool: 200,        // CRC stake pool
    progressDays: 3,
    targetDays: 5,
    joined: false,
  },
  activePlaylist: 'walk', // 'walk' | 'run'
};

let state = load() ?? structuredClone(defaultState);
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist() {
  // Wallet is owned by the host — don't persist it locally.
  const { wallet, mode, status, ...rest } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
}

function notify() {
  for (const fn of listeners) fn(state);
}

function update(patch) {
  state = { ...state, ...patch };
  persist();
  notify();
}

export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// --- Wallet --------------------------------------------------------

export function setWallet(address) {
  let normalized = null;
  if (address && isAddress(address)) {
    try { normalized = getAddress(address); } catch {}
  }
  // Reset account-scoped state on wallet change (per docs guidance).
  if (normalized !== state.wallet) {
    update({ wallet: normalized, status: '' });
  }
}

export const setMode = (mode) => update({ mode });
export const setStatus = (status) => update({ status });

// --- Food log ------------------------------------------------------

export function addMeal({ name, kcal, protein = 0, carbs = 0, fat = 0, type = 'snack' }) {
  if (!name?.trim()) throw new Error('Meal needs a name');
  if (kcal == null || isNaN(+kcal) || +kcal < 0) throw new Error('Invalid calories');
  const meal = {
    id: crypto.randomUUID(),
    name: name.trim(),
    kcal: +kcal,
    protein: +protein, carbs: +carbs, fat: +fat,
    type,
    time: new Date().toTimeString().slice(0, 5),
  };
  update({ today: { ...state.today, meals: [...state.today.meals, meal] } });
}

export function removeMeal(id) {
  update({
    today: { ...state.today, meals: state.today.meals.filter(m => m.id !== id) },
  });
}

// --- Music ---------------------------------------------------------

export function setActivePlaylist(key) {
  if (key !== 'walk' && key !== 'run') return;
  if (state.activePlaylist === key) return;
  update({ activePlaylist: key });
}

// --- Totals --------------------------------------------------------

export function getTotals() {
  return state.today.meals.reduce(
    (acc, m) => ({
      kcal:    acc.kcal    + m.kcal,
      protein: acc.protein + m.protein,
      carbs:   acc.carbs   + m.carbs,
      fat:     acc.fat     + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// --- Challenge (on-chain) ------------------------------------------

export async function joinChallenge() {
  if (!state.wallet) {
    setStatus('Connect your wallet via the host first.');
    return;
  }

  setStatus('Submitting stake…');

  // TODO: replace with a call to your real challenge-escrow contract
  // on Gnosis Chain. For now this is a no-op tx (0 value back to
  // self) so you can verify the host approval flow end-to-end.
  //
  // Sketch of what the real call will look like:
  //
  //   import { encodeFunctionData, parseUnits } from 'viem';
  //   const data = encodeFunctionData({
  //     abi: challengeAbi,
  //     functionName: 'join',
  //     args: [challengeId, parseUnits(String(state.challenge.pool / 4), 18)],
  //   });
  //   const txs = [{ to: CHALLENGE_CONTRACT, data, value: 0n }];

  const txs = [{ to: state.wallet, data: '0x', value: 0n }];

  try {
    const hashes = await submitTransactions(txs);
    update({ challenge: { ...state.challenge, joined: true } });
    setStatus(`Joined: ${hashes[0]?.slice(0, 10)}…`);
  } catch (err) {
    setStatus(`Failed: ${err.shortMessage || err.message || String(err)}`);
  }
}
