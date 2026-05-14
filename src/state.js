// App state + actions. No SDK imports here — domain logic only.
// localStorage for MVP persistence; swap for a backend or on-chain
// storage when you outgrow it.

import { getAddress, isAddress } from 'viem';
import { submitTransactions } from './bridge.js';
import {
  DEFAULT_CONFIG,
  makeMockLobby,
  activateChallenge,
  tickDay,
  bumpYourSteps,
  endChallenge as endMock,
  resetChallenge,
} from './demo.js';
import {
  isChainAlive,
  getEthBalance,
  createChallengeOnChain,
  joinChallengeOnChain,
  submitStepsOnChain,
  settleOnChain,
  withdrawOnChain,
  fastForward,
  getWithdrawable,
  CHALLENGE_ADDRESS,
} from './chain.js';

const STORAGE_KEY = 'circles-fitness-state-v1';

const emptyMealSearch = {
  open: false,
  query: '',
  results: [],
  loading: false,
  error: null,
  selected: null, // { product, grams }
};

const defaultState = {
  wallet: null,
  mode: 'standalone', // 'standalone' | 'miniapp'
  status: '',
  profile: null,         // { sex, age, heightCm, weightKg, activity, goal }
  showOnboarding: false, // true on first load when profile is missing
  mealSearch: { ...emptyMealSearch },
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
  // Wooden-spoon challenge state machine: idle → lobby → active → ended → idle.
  challenge: {
    state: 'idle',
    config: null,
    group: null,
    timing: null,
    settlement: null,
  },
  // Mock CRC balance used by the demo flow. Replaced by real on-chain
  // balance when the contract is wired up.
  balance: {
    available: 200,
    locked: 0,
  },
  // Modal for configuring a new challenge.
  showChallengeConfig: false,
  // On-chain integration state. Set during initChain() at boot.
  chain: {
    alive:    false,
    address:  CHALLENGE_ADDRESS,
    pending:  false, // true while waiting on a tx
  },
  activePlaylist: 'walk', // 'walk' | 'run'
};

// Merge any persisted state with defaults so newly-added fields
// don't break older saves.
const loaded = load();
let state = loaded
  ? {
      ...structuredClone(defaultState),
      ...loaded,
      mealSearch: { ...emptyMealSearch },
      // Migrate stale legacy challenge shape ({ title, pool, joined, ... })
      challenge: loaded.challenge?.state ? loaded.challenge : structuredClone(defaultState.challenge),
      balance: loaded.balance ?? structuredClone(defaultState.balance),
      showChallengeConfig: false,
    }
  : structuredClone(defaultState);
// Auto-open onboarding on every load until a profile is set.
if (!state.profile) state.showOnboarding = true;
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

// --- Profile / goals -----------------------------------------------

const ACTIVITY_FACTORS = {
  sedentary:    1.2,
  light:        1.375,
  moderate:     1.55,
  active:       1.725,
  'very-active': 1.9,
};

const GOAL_MULTIPLIERS = {
  cut:      0.85,
  maintain: 1.0,
  gain:     1.15,
};

// Mifflin–St Jeor. Returns null if any required field is missing.
export function computeGoals(p) {
  if (!p?.age || !p?.heightCm || !p?.weightKg) return null;
  let bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  bmr += p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78; // 'other' = midpoint
  const factor = ACTIVITY_FACTORS[p.activity] ?? 1.4;
  const goalMult = GOAL_MULTIPLIERS[p.goal] ?? 1.0;
  const tdee = bmr * factor * goalMult;
  return {
    calories: Math.round(tdee / 10) * 10,
    protein:  Math.round(p.weightKg * 1.8),
    steps:    10000,
  };
}

export function saveProfile(profile) {
  const goals = computeGoals(profile) ?? state.goals;
  update({ profile, goals, showOnboarding: false });
}

export function openOnboarding()  { update({ showOnboarding: true });  }
export function closeOnboarding() { update({ showOnboarding: false }); }

// --- Meal search (Open Food Facts) --------------------------------

export function openMealSearch()  { update({ mealSearch: { ...emptyMealSearch, open: true }}); }
export function closeMealSearch() { update({ mealSearch: { ...emptyMealSearch, open: false }}); }

export function setMealQuery(query) {
  update({ mealSearch: { ...state.mealSearch, query, loading: query.trim().length >= 2, error: null }});
}

export function setMealResults(results, forQuery) {
  if (forQuery !== state.mealSearch.query) return; // stale response
  update({ mealSearch: { ...state.mealSearch, results, loading: false, error: null }});
}

export function setMealSearchError(error) {
  update({ mealSearch: { ...state.mealSearch, loading: false, error }});
}

export function selectMealProduct(product) {
  update({ mealSearch: { ...state.mealSearch, selected: { product, grams: 100 }}});
}

export function unselectMealProduct() {
  update({ mealSearch: { ...state.mealSearch, selected: null }});
}

export function setSelectedGrams(grams) {
  const sel = state.mealSearch.selected;
  if (!sel) return;
  const clean = Math.max(1, Math.min(2000, Number(grams) || 0));
  update({ mealSearch: { ...state.mealSearch, selected: { ...sel, grams: clean }}});
}

export function macrosForProduct(product, grams) {
  const n = product?.nutriments || {};
  const f = (Number(grams) || 0) / 100;
  return {
    kcal:    Math.round((n['energy-kcal_100g']   ?? 0) * f),
    protein: Math.round((n['proteins_100g']      ?? 0) * f),
    carbs:   Math.round((n['carbohydrates_100g'] ?? 0) * f),
    fat:     Math.round((n['fat_100g']           ?? 0) * f),
  };
}

export function confirmSelectedMeal() {
  const sel = state.mealSearch.selected;
  if (!sel) return;
  const { product, grams } = sel;
  const macros = macrosForProduct(product, grams);
  const baseName = product.product_name?.trim() || 'Untracked food';
  const brand = product.brands?.split(',')[0]?.trim();
  const name = brand ? `${baseName} (${brand})` : baseName;
  addMeal({ name, ...macros });
  closeMealSearch();
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

// --- Challenge state machine ---------------------------------------
//
// Flow: idle → lobby → active → ended → idle.
//
// When the local Anvil chain is alive (state.chain.alive), each
// transition fires a real on-chain transaction. Otherwise we fall
// back to a pure in-memory mock so the UI still works offline.

export function openChallengeConfig()  { update({ showChallengeConfig: true });  }
export function closeChallengeConfig() { update({ showChallengeConfig: false }); }

// One-time boot: probe the chain, read your starting balance.
export async function initChain() {
  const alive = await isChainAlive();
  if (!alive) {
    update({ chain: { ...state.chain, alive: false } });
    return;
  }
  const eth = await getEthBalance('you');
  update({
    chain:   { ...state.chain, alive: true },
    balance: { available: Math.round(eth), locked: 0 },
  });
}

async function withPendingTx(fn) {
  update({ chain: { ...state.chain, pending: true } });
  try {
    return await fn();
  } finally {
    update({ chain: { ...state.chain, pending: false } });
  }
}

// Create the lobby. On-chain: deploys a challenge instance and stores
// the on-chain id alongside the mock state.
export async function createChallenge(config = DEFAULT_CONFIG) {
  const mock = makeMockLobby(config);
  if (!state.chain.alive) {
    update({ challenge: mock, showChallengeConfig: false });
    return;
  }
  update({ showChallengeConfig: false });
  await withPendingTx(async () => {
    setStatus('Creating challenge on chain…');
    const onChainId = await createChallengeOnChain(config);
    mock.onChainId = onChainId;
    update({ challenge: mock });
    setStatus(`Created challenge #${onChainId}`);
  });
}

// Lobby → active. On-chain: all 4 members join() with their stake.
export async function stakeAndJoin() {
  const c = state.challenge;
  if (c.state !== 'lobby') return;
  const required = c.config.stakeX + c.config.stakeP;

  if (!state.chain.alive) {
    if (state.balance.available < required) {
      setStatus(`Not enough CRC. Need ${required}, have ${state.balance.available}.`);
      return;
    }
    const activated = activateChallenge(c);
    update({
      challenge: activated,
      balance:   { available: state.balance.available - required, locked: state.balance.locked + required },
    });
    return;
  }

  await withPendingTx(async () => {
    setStatus('Submitting stakes on chain…');
    for (const who of ['you', 'alex', 'maria', 'joao']) {
      await joinChallengeOnChain(c.onChainId, who, required);
    }
    const activated = activateChallenge(c);
    activated.onChainId = c.onChainId;
    const eth = await getEthBalance('you');
    update({
      challenge: activated,
      balance:   { available: Math.round(eth), locked: required },
    });
    setStatus('Locked in.');
  });
}

export function advanceDay() {
  if (state.challenge.state !== 'active') return;
  const ticked = tickDay(state.challenge);
  ticked.onChainId = state.challenge.onChainId;
  update({ challenge: ticked });
}

export function addYourSteps(delta) {
  if (state.challenge.state !== 'active') return;
  const bumped = bumpYourSteps(state.challenge, delta);
  bumped.onChainId = state.challenge.onChainId;
  update({ challenge: bumped });
}

// End the challenge. On-chain: submit each member's final step count,
// fast-forward past the duration, settle.
export async function endChallengeNow() {
  const c = state.challenge;
  if (c.state !== 'active') return;

  if (!state.chain.alive) {
    update({ challenge: endMock(c) });
    return;
  }

  await withPendingTx(async () => {
    setStatus('Submitting final step counts on chain…');
    for (const m of c.group.members) {
      const key = m.id; // 'you' | 'alex' | 'maria' | 'joao' match KEYS
      await submitStepsOnChain(c.onChainId, key, m.steps);
    }
    setStatus('Fast-forwarding chain time…');
    await fastForward(c.config.durationDays * 86400 + 60);
    setStatus('Settling…');
    await settleOnChain(c.onChainId);
    const ended = endMock(c);
    ended.onChainId = c.onChainId;
    update({ challenge: ended });
    setStatus('Settled.');
  });
}

export async function claimWinnings() {
  const c = state.challenge;
  if (c.state !== 'ended' || c.settlement?.claimed) return;

  if (!state.chain.alive) {
    const yourNet = c.settlement.rankings.find(r => r.isYou)?.payout ?? 0;
    const yourStake = c.config.stakeX + c.config.stakeP;
    update({
      challenge: { ...c, settlement: { ...c.settlement, claimed: true }},
      balance:   {
        available: state.balance.available + yourStake + yourNet,
        locked:    Math.max(0, state.balance.locked - yourStake),
      },
    });
    return;
  }

  await withPendingTx(async () => {
    setStatus('Withdrawing winnings on chain…');
    // Anyone with a positive withdrawable can call. For demo we have
    // all keys, so claim for all members so the contract is clean.
    for (const who of ['you', 'alex', 'maria', 'joao']) {
      const owed = await getWithdrawable(c.onChainId, who);
      if (owed > 0) {
        await withdrawOnChain(c.onChainId, who);
      }
    }
    const eth = await getEthBalance('you');
    update({
      challenge: { ...c, settlement: { ...c.settlement, claimed: true }},
      balance:   { available: Math.round(eth), locked: 0 },
    });
    setStatus('Claimed.');
  });
}

export function resetToIdle() {
  update({ challenge: resetChallenge() });
}
