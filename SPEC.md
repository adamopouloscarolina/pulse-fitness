# BPM · Bet · Play · Move — v1 Spec

A fitness mini-app that runs in the Circles host, monetizes via CRC, and uses the trust graph for what no other fitness app can do: peer-verified progress.

## What we're building

A desktop-first (mobile later) web app where friends form small groups, stake CRC against a weekly fitness goal, and pay out by rank — with an "anchor" penalty for the worst performer. Food is logged via search (no manual calorie typing), steps come from iPhone Health via an Apple Shortcut bridge, and challenge verification starts honor-based with a dispute window.

The app does not mint CRC. It routes flows that already exist: users' UBI accrual and (later) sponsor pools.

---

## Visual direction — Light + Lavender

Soft, friendly, "wellness app" energy with Circles-warm purple as the anchor.

**Starter palette** (we'll tune live):

```
--bg            #f6f3fb   /* very pale lavender — replaces the cream */
--surface       #ffffff   /* card white */
--surface-2     #efeafa   /* tinted card for emphasis */
--text          #1a1330   /* near-black with a violet bias */
--text-2        #5c5474
--text-3        #8b85a0
--border        rgba(83, 74, 183, 0.10)

--purple        #6c5ce7   /* slightly warmer / brighter than current #534ab7 */
--purple-50     #ece9fb
--purple-900    #221a5c
--coral         #ff7a59   /* warm accent for streaks / rewards */
--mint          #4cc9a5   /* success / goal-hit */
--amber         #ffb547   /* in-progress */
```

Type: keep system sans for now. Headings get more weight on desktop. Numbers (kcal, steps) stay tabular and oversized — they're the hero.

## Desktop layout — Dashboard grid

Kill the phone frame. Centered shell, max ~1200px. Three-column grid on wide screens, collapses to two then one on narrow.

```
┌────────────────────────────────────────────────────────────────┐
│  Fit Circles                                  [wallet pill]    │
├──────────────────────┬──────────────────┬──────────────────────┤
│                      │                  │                      │
│   CALORIES TODAY     │   STEPS / SYNC   │   WEEKLY CHALLENGE   │
│   (hero number)      │   (number +      │   (pot, rank list,   │
│   macro bars         │    last sync)    │    stake CTA)        │
│                      │                  │                      │
├──────────────────────┴──────────────────┤                      │
│                                          │   GROUP ROSTER       │
│   TODAY'S MEALS                          │   (avatars, status)  │
│   (search-to-add, list, totals)          │                      │
│                                          │                      │
└──────────────────────────────────────────┴──────────────────────┘
```

Below 900px: stack to two columns. Below 640px: single column (effectively mobile fallback, no phone frame).

---

## Core flows

### 1. Food logging — Open Food Facts search

Replace `prompt()`-based entry. New flow:

1. User clicks "+ Add meal"
2. Inline search field appears, debounced (300ms)
3. Query `https://world.openfoodfacts.org/cgi/search.pl?search_terms=<q>&json=1&page_size=5`
4. Show 5 matches with kcal/100g, brand, image thumbnail
5. User picks one + types grams (default 100g)
6. App computes kcal + protein + carbs + fat from `per_100g` × grams
7. Saved to `today.meals`

**Fallback** when no match: free-text entry with manual kcal (current behavior, kept as escape hatch).

### 2. Step tracking — Apple Shortcut bridge (v1)

We don't read HealthKit from a browser. We publish a one-tap iOS Shortcut users install once.

- Shortcut reads today's step count from Health.
- Posts to `https://api.fitcircles.app/steps` with a per-user token.
- Web app polls the endpoint or reads on load.

v2: Strava OAuth as a proxy for serious athletes.
v3: Companion iOS app if it becomes a bottleneck.

### 3. Weekly peer challenge — anchor payout

Group of 4–8 friends. 7-day cycle. Equal stakes.

**Stake structure** — every player deposits two buckets:
- `X` = the "to-win" stake (e.g., 20 CRC)
- `P` = the "anchor" deposit (e.g., 10 CRC)

Total locked per player: `X + P`.

**Payout at week end** (after verification):
| Position | Receives | Net P&L |
|---|---|---|
| 1st (winner) | own `X + P` + (N-1)·`X` + `P` from last | **+(N-1)X + P** |
| 2nd … 2nd-to-last (middle) | own `P` back only | **-X** |
| Last | nothing | **-(X + P)** |

Sums check out: total deposits = `N(X+P)`. Total paid out = `(X+P) + (N-2)P + 0 + ((N-1)X + P)` = `N(X+P)`. ✓

**Rules**:
- Equal stakes only (enforced in contract). No whale handicap.
- First-time joiners are exempt from the `P` penalty their first week (rookie protection).
- Ties at 1st: split the winner's pot. Ties at last: split the `P` penalty.
- No-show by day-end = auto-forfeit that day's progress.

### 4. Verification — honor + dispute window

v1: at week end, the contract reads claimed step totals submitted by each player. Anyone in the group can dispute within 24h, triggering a quorum vote (2-of-N signMessage). If disputed and unproven, the disputed player drops to last place.

v2: upgrade to trust-circle quorum (default-on) once we have data on cheating rates.

### 5. Soundtrack — Apple Music embedded playlists

A "Soundtrack" card with two tabs: **Walk** (steady tempo, daily steps) and **Run** (higher BPM). Each tab embeds an Apple Music playlist via the official `embed.music.apple.com` widget — no MusicKit JS, no Apple Developer token required for v1. Users with Apple Music subscriptions can play in-place; non-subscribers see a preview-only player. Playlists are config-driven (`src/playlists.js`) so anyone can swap them.

v2: MusicKit JS for full account integration, BPM-matched recommendations driven by current step cadence, and tap-to-add to a personal "Pulse" playlist.

### 6. Coach payments (v2 — not in v1)

Nutritionists/trainers join via the trust graph. Clients pay per session in personal CRC. `signMessage`-based receipts. App takes a small SaaS fee, not a per-session cut.

---

## Liquidity model — where does the CRC come from?

| Source | Mechanism | When |
|---|---|---|
| **User UBI** | Players stake their already-accruing personal CRC | v1 |
| **Forfeits among peers** | Anchor penalty redistributes from last to first | v1 |
| **Sponsor pools** | Brands seed group-CRC into the pot; app takes 10–15% | v2 |
| **DAO matching** | Treasuries seed a multiplier pool for active humans | v3 |

The app doesn't print CRC and never will. It moves CRC that's already minted.

---

## What we're *not* building in v1

- Mobile responsive design beyond a 640px stack (focus is desktop)
- Coach marketplace (v2)
- Sponsor pools (v2)
- Wearable integrations beyond Apple Shortcut (Strava/Google Fit = v2)
- Photo-based food recognition (maybe v3 — Open Food Facts text search is enough)
- Multiple simultaneous challenges per user (single active group, single active challenge)
- Group creation flow (v1 assumes one hardcoded group for the dev; real flow comes once contract is live)
- Localization (English only)

---

## Build order

1. **Desktop layout + lavender restyle.** Kill the phone frame, three-column grid, new palette wired into `:root`. No new functionality. *Verifiable: page looks like the layout above on a wide screen.*
2. **Open Food Facts food search.** Replace `prompt()` flow with inline search + portion picker. *Verifiable: type "banana", get matches, add 150g, kcal auto-fills.*
3. **Mifflin–St Jeor onboarding.** One-screen form (age, sex, weight, height, activity level) sets `goals.calories` dynamically. *Verifiable: goal updates after onboarding.*
4. **Anchor challenge contract.** Solidity on Gnosis Chain testnet. Two-bucket stake/payout as specced. *Verifiable: 4 test wallets, end-of-week settlement matches the table.*
5. **Apple Shortcut bridge.** Publish the Shortcut + a tiny `/steps` endpoint. *Verifiable: tap the Shortcut on iPhone, steps update on desktop.*
6. **Group roster + dispute UI.** Show who's joined, who's in front/behind, the dispute button. *Verifiable: end-to-end weekly cycle with 4 humans.*

Steps 1–3 are all client-side and ship this week. Steps 4–6 need a contract, a server endpoint, and real users — those are the v1 milestone.

---

## Confirmed facts from the Gnosis team (2026-05-14)

- **No single CRC contract address.** Every human avatar mints their own personal CRC token. Groups have their own token addresses. There's no `IERC20(CRC)` to call.
- **Standards.** Use **ERC-1155** for most cases (the team's explicit recommendation). Group CRC is the simpler ERC-20 fungible wrapper — best fit for our staking model.
- **No Chiado sandbox.** The Circles Chiado testnet was sunsetted. **Mainnet only.** Implications:
  - Use `anvil --fork-url https://rpc.gnosischain.com` for local development against real mainnet state.
  - Any public deploy is real-money mainnet → audit required.
- **Miniapp registration.** Contribution guide: https://docs.aboutcircles.com/miniapps/contribute-mini-apps
- **No URL constraints** for internal team members. External miniapps should pass a security review.

## Revised v1 path (post-team-answers)

1. **Stakes are group CRC, not personal CRC.** Pulse creates (or reuses) a Circles group; every member joins the group; the group's wrapped ERC-20 is what gets staked. One token type, simple math.
2. **Local dev uses Anvil mainnet fork.** Same chain ID and state as Gnosis mainnet, but local + fake gas. Lets us test against the real Circles Hub and group contracts without spending real CRC.
3. **Production deploy = direct to Gnosis mainnet with audit.** No middle step. Realistic timeline 1–3 months from now (audit is the bottleneck).
4. **Pulse hosted at a public HTTPS URL** (Vercel or Cloudflare), registered via the contribution guide as a miniapp inside the Gnosis app.

## Open questions

- Does `@aboutcircles/miniapp-sdk` expose any platform-level permissions in iOS hosts? If yes, native HealthKit access becomes possible without our own iOS app.
- Onboarding hand-off URL: **https://app.gnosis.io/welcome** — confirmed by Carolina, 2026-05-14. New-to-Circles users get deep-linked there to create their Circles identity. (Metri was retired — Gnosis app is the current onboarding surface.)
- Personal CRC vs group CRC for the stake currency. Group CRCs are ERC-20 (easier to pool); personal CRCs are ERC-1155 (truer to Circles' UBI model). Probably group CRC for v1 simplicity.
- Pool size sanity check: at 1 CRC/hour UBI, a 20 CRC stake = ~20 hours of UBI = about a day's accrual. Feels right for "this should sting if I forfeit but isn't financially scary."
