# BPM — Bet · Play · Move (Circles miniapp)

> earn the beat

A starter scaffold for a fitness mini-app that runs inside the Circles
host and uses CRC for group challenges.

## What's here

```
src/
  bridge.js   only file that touches @aboutcircles/miniapp-sdk
  state.js    app state + actions (food log, workouts, challenge)
  ui.js       single render() function — easy to extend
  styles.css  mobile-first phone-frame styling
  main.js     wires host bridge → state → UI
index.html
package.json
```

Reads cleanly top-to-bottom; the host bridge is the only place SDK
internals leak, exactly as the docs recommend.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. In standalone mode the wallet stays
disconnected (expected) — `onWalletChange` only fires inside the host.
For end-to-end wallet/transaction testing, load the built bundle into
the Circles miniapp host.

```bash
npm run build
# upload /dist to your host of choice (Vercel, Netlify, IPFS, etc.)
```

## What's wired

- `bridge.js` — wraps `isMiniappMode`, `onAppData`, `onWalletChange`,
  `sendTransactions`, `signMessage`. Normalizes every tx through one
  adapter so value-encoding is consistent.
- `state.js` — local state + actions. Resets account-scoped data when
  the wallet changes. Persists to `localStorage` (skip for production).
- `ui.js` — re-renders the whole tree on every state change. Fine for
  this size; reach for Lit / Preact / Svelte when this hurts.
- `main.js` — subscribes the host bridge to state, kicks off rendering.

## What's a placeholder

`joinChallenge()` in `state.js` currently submits a **no-op transaction**
(0 value to self) so you can verify the host approval flow works
end-to-end. To make it real you need:

1. **A challenge-escrow contract** on Gnosis Chain that holds CRC
   stakes, tracks progress, and pays out. The simplest version:

   ```solidity
   contract Challenge {
     mapping(address => uint256) public stakes;
     function join(uint256 amount) external; // pulls CRC from msg.sender
     function complete(address user, bytes calldata proof) external; // oracle/quorum
     function withdraw() external;
   }
   ```

2. **Encode the call** in `joinChallenge()` using viem's
   `encodeFunctionData`. There's a sketch in the comments.

3. **Decide how progress is verified.** Options:
   - Trust-circle quorum (N friends sign that you hit your steps)
   - Wearable API + server-side oracle
   - Honor system + CRC slash if a peer disputes within 24h

The trust-circle approach is the one that's *actually* differentiated
on Circles. Everyone else is just a Strava clone.

## What's also a placeholder

- **Step counts and heart rate** are demo values in `state.js`. Plug in
  Apple HealthKit (web → HealthKit needs a native wrapper, or use a
  companion app), Google Fit REST API, or Garmin Connect.
- **Nutritional values** are entered manually via `prompt()`. Use
  [Open Food Facts](https://world.openfoodfacts.org/data) — free,
  barcode lookup, strong European coverage. Quick fetch:

  ```js
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
  const { product } = await r.json();
  // product.nutriments['energy-kcal_100g'], product.nutriments.proteins_100g, etc.
  ```

## Next steps in roughly the right order

1. Get it running locally and load it into the Circles host once.
   Confirm `onWalletChange` fires.
2. Replace `prompt()` meal entry with a real form. Add Open Food Facts
   barcode lookup.
3. Wire one wearable integration (Google Fit is easiest for web).
4. Write the challenge contract on a Gnosis Chain testnet. Get
   `joinChallenge` to actually stake CRC.
5. Build the progress-verification layer (start with trust-circle
   quorum — fewer moving parts than oracles).
6. Coach payments: `signMessage` lets you build off-chain receipts
   where a nutritionist countersigns a session, redeemed later.

## Notes

- The SDK is `@aboutcircles/miniapp-sdk` — verify the exact published
  version with `npm view @aboutcircles/miniapp-sdk` before pinning.
- CRC v2 lives on Gnosis Chain. Personal tokens use ERC-1155; group
  tokens use ERC-20 wrappers. Check the Circles SDK docs for the
  correct transfer surface for your stake design.
