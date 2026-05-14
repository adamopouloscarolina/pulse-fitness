// Entry point. Wires the host bridge to app state, then renders.

import {
  isMiniappMode,
  onWalletChange,
  onAppData,
} from './bridge.js';

import {
  setWallet,
  setMode,
  subscribe,
} from './state.js';

import { render, initTheme } from './ui.js';

// 0. Apply theme before first paint so there's no flash.
initTheme();

// 1. Detect host mode (standalone vs running inside Circles).
setMode(isMiniappMode() ? 'miniapp' : 'standalone');

// 2. Subscribe wallet from host. This is the source of truth.
onWalletChange((address) => {
  setWallet(address);
});

// 3. Listen for context data the host may pass (referral, deep links).
onAppData((raw) => {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // TODO: validate before applying. E.g. campaign codes, deep-link
    // routes like { view: 'challenge', id: 'abc' }.
    console.log('[app-data]', data);
  } catch (err) {
    console.warn('Invalid app-data payload', err);
  }
});

// 4. Re-render on every state change. Simple, works for an MVP.
subscribe(() => render());

// First paint.
render();
