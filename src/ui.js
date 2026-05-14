// Single render function — re-renders on every state change.
// Not optimal for big apps, but clear and easy to extend.
// Move to a framework (Lit, Preact, Svelte) when this hurts.

import {
  getState, getTotals,
  addMeal, removeMeal,
  setActivePlaylist,
  saveProfile, openOnboarding, closeOnboarding,
  openMealSearch, closeMealSearch,
  setMealQuery, setMealResults, setMealSearchError,
  selectMealProduct, unselectMealProduct,
  setSelectedGrams, macrosForProduct, confirmSelectedMeal,
  openChallengeConfig, closeChallengeConfig,
  createChallenge, stakeAndJoin,
  advanceDay, addYourSteps, endChallengeNow,
  claimWinnings, resetToIdle,
} from './state.js';
import { computeRanking, computePayouts, DEFAULT_CONFIG } from './demo.js';
import { PLAYLISTS } from './playlists.js';

const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat('en-US');
const pct = (n, d) => Math.min(100, Math.round((n / d) * 100));

export function render() {
  const s = getState();
  const t = getTotals();
  const g = s.goals;
  const c = s.challenge;
  const lastWorkout = s.today.workouts.at(-1);
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  $('#app').innerHTML = `
    <div class="shell">

      <header class="topbar">
        <div class="brand">
          <span class="brand-mark"></span>
          <div class="brand-text">
            <span class="brand-name">Pulse</span>
            <span class="brand-sub">Circles Fitness Club</span>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">
            <span class="theme-icon sun">☀</span>
            <span class="theme-icon moon">☾</span>
          </button>
          ${walletPill(s)}
        </div>
      </header>

      <div class="greeting-row">
        <div>
          <p class="date">${dateStr}</p>
          <h1 class="greeting">Bom dia</h1>
        </div>
      </div>

      <div class="grid">

        <section class="card kcal-card span-2">
          <div class="kcal-head">
            <h3>Calories today</h3>
            <button class="edit-link" id="edit-profile" aria-label="Edit profile">Edit goal</button>
          </div>
          <div class="kcal-row">
            <span class="num">${fmt.format(t.kcal)}</span>
            <span class="goal">/ ${fmt.format(g.calories)} kcal</span>
          </div>
          <div class="macros">
            ${macroBar('Protein', t.protein, g.protein, 'g', 'mint')}
            ${macroBar('Carbs',   t.carbs,   260,        'g', 'amber')}
            ${macroBar('Fat',     t.fat,     70,         'g', 'coral')}
          </div>
        </section>

        ${challengeCard(s)}

        <section class="card">
          <h3>Steps</h3>
          <p class="stat-num">${fmt.format(s.today.steps)}</p>
          <p class="stat-sub">of ${fmt.format(g.steps)} goal</p>
          <div class="bar purple-track" style="margin-top:10px;">
            <div class="bar-fill purple-bg" style="width:${pct(s.today.steps, g.steps)}%"></div>
          </div>
        </section>

        <section class="card">
          <h3>Last session</h3>
          <p class="stat-num">${lastWorkout?.avgHr ?? '—'}<span class="muted sm"> bpm</span></p>
          <p class="stat-sub">${lastWorkout ? `${lastWorkout.kind} · ${lastWorkout.durationMin} min` : 'No workout yet'}</p>
        </section>

        <section class="card meals-card span-2">
          <div class="head">
            <h3 style="margin:0;">Today's meals</h3>
            <button class="add-btn" id="add-meal">+ Add meal</button>
          </div>
          <div class="meals-list">
            ${s.today.meals.map(mealRow).join('') || '<p class="empty">No meals logged yet.</p>'}
          </div>
        </section>

        ${musicCard(s)}

        ${s.status ? `<p class="status">${escape(s.status)}</p>` : ''}
      </div>

      ${s.showOnboarding ? onboardingModal(s) : ''}
      ${s.showChallengeConfig ? challengeConfigModal(s) : ''}
      ${s.mealSearch.open ? mealSearchModal(s) : ''}
    </div>
  `;

  wire();
}

// --- Challenge card (state machine: idle / lobby / active / ended) -

function challengeCard(s) {
  const c = s.challenge;
  switch (c.state) {
    case 'lobby':  return challengeLobby(s, c);
    case 'active': return challengeActive(s, c);
    case 'ended':  return challengeEnded(s, c);
    case 'idle':
    default:       return challengeIdle(s);
  }
}

function challengeIdle(s) {
  return `
    <section class="card challenge challenge-idle">
      <h3>Weekly challenge</h3>
      <p class="title">No active challenge</p>
      <p class="idle-sub">Start a challenge with friends. Most steps over the week takes the pot.</p>
      <div class="balance-strip">
        <span class="balance-label">Your CRC</span>
        <span class="balance-num">${s.balance.available}</span>
      </div>
      <button class="btn" id="start-challenge">Start a challenge</button>
    </section>
  `;
}

function challengeLobby(s, c) {
  const required = c.config.stakeX + c.config.stakeP;
  const totalPool = c.group.members.length * required;
  const canStake = s.balance.available >= required;
  return `
    <section class="card challenge challenge-lobby">
      <div class="lobby-head">
        <h3>Group lobby</h3>
        <button class="ghost-btn" id="cancel-lobby" aria-label="Cancel">×</button>
      </div>
      <p class="title">${goalLabel(c.config.goal)} · ${c.config.durationDays} days</p>
      <div class="lobby-members">
        ${c.group.members.map(memberPill).join('')}
      </div>
      <div class="stake-row">
        <div class="stake-col">
          <span class="stake-label">Your stake</span>
          <span class="stake-val">${required} CRC</span>
          <span class="stake-sub">${c.config.stakeX} to win · ${c.config.stakeP} penalty</span>
        </div>
        <div class="stake-col stake-pool">
          <span class="stake-label">Total pool</span>
          <span class="stake-val">${totalPool} CRC</span>
          <span class="stake-sub">${c.group.members.length} members</span>
        </div>
      </div>
      <button class="btn" id="stake-and-join" ${canStake ? '' : 'disabled'}>
        ${canStake ? `Stake ${required} CRC & lock in` : `Not enough CRC (need ${required})`}
      </button>
    </section>
  `;
}

function challengeActive(s, c) {
  const ranked = computeRanking(c.group.members);
  const youRanked = ranked.find(m => m.isYou);
  const projected = computePayouts(ranked, c.config).find(m => m.isYou);
  const N = ranked.length;
  const bestCase = (N - 1) * c.config.stakeX + c.config.stakeP;
  const worstCase = -(c.config.stakeX + c.config.stakeP);
  const daysLeft = c.config.durationDays - c.timing.day + 1;

  return `
    <section class="card challenge challenge-active">
      <div class="lobby-head">
        <h3>Day ${c.timing.day} of ${c.config.durationDays}</h3>
        <span class="days-left">${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left</span>
      </div>
      <p class="title">${goalLabel(c.config.goal)}</p>
      <div class="leaderboard">
        ${ranked.map(leaderRow).join('')}
      </div>
      <div class="projection">
        <div class="proj-line">
          <span>If standings hold:</span>
          <strong class="${projected.payout >= 0 ? 'pos' : 'neg'}">${signed(projected.payout)} CRC</strong>
        </div>
        <div class="proj-extremes">
          <span>Best (1st): <strong class="pos">+${bestCase}</strong></span>
          <span>Worst (last): <strong class="neg">${worstCase}</strong></span>
        </div>
      </div>
      <details class="demo-controls">
        <summary>Demo controls</summary>
        <div class="demo-btns">
          <button data-demo="add-steps">+ 2,000 steps (you)</button>
          <button data-demo="advance-day">Skip a day</button>
          <button data-demo="end-now">End now</button>
        </div>
      </details>
    </section>
  `;
}

function challengeEnded(s, c) {
  const ranked = c.settlement.rankings;
  const you = ranked.find(m => m.isYou);
  const claimed = c.settlement.claimed;
  return `
    <section class="card challenge challenge-ended">
      <h3>Challenge complete</h3>
      <p class="title">${rankEmoji(you.rank)} You finished ${ordinal(you.rank)}</p>
      <div class="settlement-list">
        ${ranked.map(settlementRow).join('')}
      </div>
      <div class="your-payout">
        <span>Your net</span>
        <strong class="${you.payout >= 0 ? 'pos' : 'neg'}">${signed(you.payout)} CRC</strong>
      </div>
      <button class="btn" id="claim-winnings" ${claimed ? 'disabled' : ''}>
        ${claimed ? 'Settled ✓ — Start new challenge' : (you.payout >= 0 ? `Claim ${you.payout} CRC` : 'Settle stake')}
      </button>
      ${claimed ? `<button class="ghost-btn full" id="reset-to-idle">Start a new challenge</button>` : ''}
    </section>
  `;
}

function challengeConfigModal(s) {
  const c = DEFAULT_CONFIG;
  return `
    <div class="modal-backdrop" id="challenge-config-backdrop">
      <div class="modal" role="dialog">
        <button class="modal-close" id="challenge-config-close">×</button>
        <h2>Start a challenge</h2>
        <p class="modal-sub">You + 3 friends compete for a week. Top score takes the pool. Last place pays a wooden-spoon penalty.</p>

        <form id="challenge-config-form" class="profile-form">
          <fieldset class="seg-group">
            <legend>Goal</legend>
            <div class="seg">
              <label><input type="radio" name="goal" value="steps" checked> Most steps</label>
              <label><input type="radio" name="goal" value="distance-km"> Most km</label>
              <label><input type="radio" name="goal" value="active-min"> Most active min</label>
            </div>
          </fieldset>

          <fieldset class="seg-group">
            <legend>Duration</legend>
            <div class="seg">
              <label><input type="radio" name="durationDays" value="3"> 3 days</label>
              <label><input type="radio" name="durationDays" value="7" checked> 7 days</label>
              <label><input type="radio" name="durationDays" value="14"> 14 days</label>
            </div>
          </fieldset>

          <div class="grid-2">
            <label class="field">
              <span>To-win stake (CRC)</span>
              <input type="number" name="stakeX" value="${c.stakeX}" min="1" max="500" />
            </label>
            <label class="field">
              <span>Wooden-spoon (CRC)</span>
              <input type="number" name="stakeP" value="${c.stakeP}" min="0" max="500" />
            </label>
          </div>

          <p class="modal-sub" style="margin: 2px 0 14px;">
            Winner gets <strong>+(N−1)·X + P</strong> · middle losers pay X · last pays X + P
          </p>

          <button type="submit" class="primary-btn">Create lobby</button>
        </form>
      </div>
    </div>
  `;
}

// --- Tiny helpers ----------------------------------------

function memberPill(m) {
  return `
    <div class="member-pill ${m.isYou ? 'is-you' : ''}">
      <span class="avatar" style="background:${m.color}">${m.initials}</span>
      <span class="member-name">${m.name}</span>
      <span class="member-status">${m.status === 'joined' ? '✓' : '⏱'}</span>
    </div>
  `;
}

function leaderRow(m) {
  return `
    <div class="leader-row ${m.isYou ? 'is-you' : ''}">
      <span class="leader-rank">${m.rank}</span>
      <span class="avatar" style="background:${m.color}">${m.initials}</span>
      <span class="leader-name">${m.name}</span>
      <span class="leader-steps">${new Intl.NumberFormat('en-US').format(m.steps)}</span>
    </div>
  `;
}

function settlementRow(m) {
  return `
    <div class="leader-row ${m.isYou ? 'is-you' : ''}">
      <span class="leader-rank">${rankEmoji(m.rank)}</span>
      <span class="avatar" style="background:${m.color}">${m.initials}</span>
      <span class="leader-name">${m.name}</span>
      <span class="leader-payout ${m.payout >= 0 ? 'pos' : 'neg'}">${signed(m.payout)} CRC</span>
    </div>
  `;
}

const goalLabel = (g) => ({
  'steps':       'Most steps',
  'distance-km': 'Most kilometres',
  'active-min':  'Most active minutes',
}[g] ?? g);

const ordinal = (n) => ['1st','2nd','3rd','4th','5th','6th','7th','8th'][n - 1] ?? `${n}th`;
const rankEmoji = (n) => ({1:'🥇',2:'🥈',3:'🥉'}[n] ?? (n === 4 ? '🥄' : `#${n}`));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function mealSearchModal(s) {
  const ms = s.mealSearch;
  return `
    <div class="modal-backdrop" id="meal-search-backdrop">
      <div class="modal meal-search-modal" role="dialog" aria-labelledby="meal-title">
        <button class="modal-close" id="meal-search-close" aria-label="Close">×</button>
        ${ms.selected ? selectedFoodView(ms.selected) : searchFoodView(ms)}
      </div>
    </div>
  `;
}

function searchFoodView(ms) {
  return `
    <h2 id="meal-title">Add a meal</h2>
    <p class="modal-sub">Search the Open Food Facts database. Free, no signup.</p>
    <div class="meal-search-bar">
      <input
        id="meal-search-input"
        type="text"
        placeholder="What did you eat? e.g. banana, oats, yogurt"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <div class="meal-results">
      ${ms.loading
        ? '<p class="muted center pad">Searching…</p>'
        : ms.error
          ? `<p class="error pad">${escape(ms.error)}</p>`
          : ms.results.length
            ? ms.results.slice(0, 8).map((p, i) => resultRow(p, i)).join('')
            : ms.query.trim().length >= 2
              ? '<p class="muted center pad">No matches. Try a more general term.</p>'
              : '<p class="muted center pad">Start typing to search.</p>'
      }
    </div>
  `;
}

function resultRow(product, idx) {
  const n = product.nutriments || {};
  const kcal = Math.round(n['energy-kcal_100g'] ?? 0);
  const protein = Math.round(n['proteins_100g'] ?? 0);
  const name = product.product_name?.trim() || 'Unnamed food';
  const brand = product.brands?.split(',')[0]?.trim();
  const thumb = product.image_thumb_url
    ? `<img src="${product.image_thumb_url}" class="result-thumb" alt="" />`
    : `<div class="result-thumb result-thumb-empty">🥗</div>`;
  return `
    <button class="result-row" data-pick="${idx}">
      ${thumb}
      <div class="result-info">
        <p class="result-name">${escape(name)}</p>
        <p class="result-meta">${kcal} kcal · ${protein}g protein / 100g${brand ? ` · ${escape(brand)}` : ''}</p>
      </div>
    </button>
  `;
}

function selectedFoodView(sel) {
  const { product, grams } = sel;
  const macros = macrosForProduct(product, grams);
  const name = product.product_name?.trim() || 'Unnamed food';
  const brand = product.brands?.split(',')[0]?.trim();
  const thumb = product.image_thumb_url
    ? `<img src="${product.image_thumb_url}" class="selected-thumb" alt="" />`
    : '';
  return `
    <button class="back-btn" id="meal-back">← Back to search</button>
    <h2>${escape(name)}</h2>
    ${brand ? `<p class="modal-sub">${escape(brand)}</p>` : '<p class="modal-sub">Open Food Facts entry</p>'}
    ${thumb}
    <label class="field grams-field">
      <span>Portion (grams)</span>
      <input id="grams-input" type="number" min="1" max="2000" step="1" value="${grams}" />
    </label>
    <div class="macros-preview">
      <div class="macro-pill macro-pill-hero"><strong>${macros.kcal}</strong><span>kcal</span></div>
      <div class="macro-pill">${macros.protein}g P</div>
      <div class="macro-pill">${macros.carbs}g C</div>
      <div class="macro-pill">${macros.fat}g F</div>
    </div>
    <button class="primary-btn" id="confirm-meal">Add to today</button>
  `;
}

function onboardingModal(s) {
  const p = s.profile ?? {};
  const sel = (v, target) => v === target ? 'selected' : '';
  const chk = (v, target) => v === target ? 'checked' : '';
  return `
    <div class="modal-backdrop" id="onboarding-backdrop">
      <div class="modal" role="dialog" aria-labelledby="onb-title">
        <button class="modal-close" id="onboarding-close" aria-label="Close">×</button>
        <h2 id="onb-title">Set up your profile</h2>
        <p class="modal-sub">We'll calculate a daily calorie target. Numbers stay on your device.</p>

        <form id="profile-form" class="profile-form">
          <fieldset class="seg-group">
            <legend>I am</legend>
            <div class="seg">
              <label><input type="radio" name="sex" value="female" ${chk(p.sex, 'female')}> Female</label>
              <label><input type="radio" name="sex" value="male"   ${chk(p.sex, 'male')}> Male</label>
              <label><input type="radio" name="sex" value="other"  ${chk(p.sex, 'other')}> Other</label>
            </div>
          </fieldset>

          <div class="grid-2">
            <label class="field">
              <span>Age</span>
              <input type="number" name="age" min="13" max="100" required value="${p.age ?? ''}" placeholder="32">
            </label>
            <label class="field">
              <span>Height (cm)</span>
              <input type="number" name="heightCm" min="120" max="230" required value="${p.heightCm ?? ''}" placeholder="170">
            </label>
          </div>

          <label class="field">
            <span>Weight (kg)</span>
            <input type="number" name="weightKg" min="30" max="250" step="0.1" required value="${p.weightKg ?? ''}" placeholder="65">
          </label>

          <label class="field">
            <span>Activity level</span>
            <select name="activity" required>
              <option value="sedentary"   ${sel(p.activity, 'sedentary')}>Sedentary — desk job, little exercise</option>
              <option value="light"       ${sel(p.activity, 'light')}>Light — exercise 1–3×/week</option>
              <option value="moderate"    ${sel(p.activity ?? 'moderate', 'moderate')}>Moderate — exercise 3–5×/week</option>
              <option value="active"      ${sel(p.activity, 'active')}>Active — exercise 6–7×/week</option>
              <option value="very-active" ${sel(p.activity, 'very-active')}>Very active — intense daily training</option>
            </select>
          </label>

          <fieldset class="seg-group">
            <legend>Goal</legend>
            <div class="seg">
              <label><input type="radio" name="goal" value="cut"      ${chk(p.goal, 'cut')}> Lose weight</label>
              <label><input type="radio" name="goal" value="maintain" ${chk(p.goal ?? 'maintain', 'maintain')}> Maintain</label>
              <label><input type="radio" name="goal" value="gain"     ${chk(p.goal, 'gain')}> Gain</label>
            </div>
          </fieldset>

          <button type="submit" class="primary-btn">Calculate my targets</button>
        </form>
      </div>
    </div>
  `;
}

function walletPill(s) {
  if (!s.wallet) {
    const label = s.mode === 'miniapp' ? 'Awaiting wallet…' : 'Standalone';
    return `<div class="pill gray"><span class="dot"></span>${label}</div>`;
  }
  return `<div class="pill purple"><span class="dot"></span>${s.wallet.slice(0, 6)}…${s.wallet.slice(-4)}</div>`;
}

function macroBar(label, value, goal, unit, color) {
  return `
    <div class="macro">
      <div class="macro-label">
        <span class="muted">${label}</span>
        <span class="bold">${Math.round(value)}${unit}</span>
      </div>
      <div class="bar ${color}-track">
        <div class="bar-fill ${color}-bg" style="width:${pct(value, goal)}%"></div>
      </div>
    </div>
  `;
}

function mealRow(m) {
  return `
    <div class="meal-row" data-id="${m.id}">
      <div>
        <p class="name">${escape(m.name)}</p>
        <p class="meta">${cap(m.type)} · ${m.time}</p>
      </div>
      <div style="display:flex;align-items:center;">
        <span class="kcal">${m.kcal} kcal</span>
        <button class="x" data-remove="${m.id}" aria-label="Remove meal">×</button>
      </div>
    </div>
  `;
}

function musicCard(s) {
  const active = PLAYLISTS[s.activePlaylist] ?? PLAYLISTS.walk;
  const embed = active.embedUrl
    ? `<iframe
        class="music-iframe"
        allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        src="${active.embedUrl}"
        title="${active.title} playlist"></iframe>`
    : `<div class="music-empty">
         <p class="empty-title">No ${active.title.toLowerCase()} playlist yet</p>
         <p class="empty-sub">Open <code>src/playlists.js</code> and paste an Apple Music embed URL.</p>
       </div>`;

  return `
    <section class="card music-card span-2">
      <div class="head">
        <h3 style="margin:0;">🎧 Soundtrack</h3>
        <div class="tabs" role="tablist">
          ${tabBtn('walk', s.activePlaylist === 'walk')}
          ${tabBtn('run',  s.activePlaylist === 'run')}
        </div>
      </div>
      <p class="music-tagline">${escape(active.tagline)}</p>
      <p class="music-meta">${active.emoji} ${escape(active.meta)}</p>
      <div class="music-embed">${embed}</div>
    </section>
  `;
}

function tabBtn(key, active) {
  const label = PLAYLISTS[key].title;
  return `<button class="tab ${active ? 'is-active' : ''}" data-tab="${key}" role="tab" aria-selected="${active}">${label}</button>`;
}

function wire() {
  $('#theme-toggle')?.addEventListener('click', toggleTheme);
  $('#edit-profile')?.addEventListener('click', openOnboarding);
  $('#onboarding-close')?.addEventListener('click', closeOnboarding);
  $('#onboarding-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'onboarding-backdrop') closeOnboarding();
  });
  $('#profile-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    saveProfile({
      sex:      fd.get('sex') || 'other',
      age:      Number(fd.get('age')),
      heightCm: Number(fd.get('heightCm')),
      weightKg: Number(fd.get('weightKg')),
      activity: fd.get('activity') || 'moderate',
      goal:     fd.get('goal') || 'maintain',
    });
  });

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => setActivePlaylist(btn.getAttribute('data-tab')));
  });

  $('#add-meal')?.addEventListener('click', openMealSearch);
  wireMealSearch();

  // Challenge state machine
  $('#start-challenge')?.addEventListener('click', openChallengeConfig);
  $('#challenge-config-close')?.addEventListener('click', closeChallengeConfig);
  $('#challenge-config-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'challenge-config-backdrop') closeChallengeConfig();
  });
  $('#challenge-config-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createChallenge({
      goal:         fd.get('goal') || 'steps',
      durationDays: Number(fd.get('durationDays')) || 7,
      stakeX:       Number(fd.get('stakeX')) || 20,
      stakeP:       Number(fd.get('stakeP')) || 10,
    });
  });
  $('#cancel-lobby')?.addEventListener('click', resetToIdle);
  $('#stake-and-join')?.addEventListener('click', stakeAndJoin);

  // Demo controls (only present during 'active')
  document.querySelectorAll('[data-demo]').forEach(btn => {
    const action = btn.getAttribute('data-demo');
    btn.addEventListener('click', () => {
      if (action === 'add-steps')    addYourSteps(2000);
      if (action === 'advance-day')  advanceDay();
      if (action === 'end-now')      endChallengeNow();
    });
  });

  // Settlement
  $('#claim-winnings')?.addEventListener('click', () => {
    const claimed = getState().challenge.settlement?.claimed;
    if (claimed) resetToIdle(); else claimWinnings();
  });
  $('#reset-to-idle')?.addEventListener('click', resetToIdle);

  document.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeMeal(btn.getAttribute('data-remove'));
    });
  });
}

// --- Meal search wiring -----------------------------------------

let searchTimer;

async function runMealSearch(q) {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(q)}&fields=product_name,brands,image_thumb_url,nutriments,code&page_size=8`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    const results = (data.products || []).filter(p => (p.nutriments?.['energy-kcal_100g'] ?? 0) > 0);
    setMealResults(results, q);
  } catch (err) {
    setMealSearchError(err.message || 'Search failed');
  }
}

function wireMealSearch() {
  const s = getState();
  if (!s.mealSearch.open) return;

  $('#meal-search-close')?.addEventListener('click', closeMealSearch);
  $('#meal-search-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'meal-search-backdrop') closeMealSearch();
  });

  // SEARCH VIEW
  const input = $('#meal-search-input');
  if (input) {
    // Sync input value from state without losing cursor position
    if (document.activeElement?.id !== 'meal-search-input') {
      input.value = s.mealSearch.query;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }

    input.addEventListener('input', () => {
      const q = input.value;
      clearTimeout(searchTimer);
      setMealQuery(q);
      if (q.trim().length < 2) return;
      searchTimer = setTimeout(() => runMealSearch(q), 350);
    });
  }

  document.querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-pick'));
      const product = getState().mealSearch.results[idx];
      if (product) selectMealProduct(product);
    });
  });

  // SELECTED VIEW
  $('#meal-back')?.addEventListener('click', unselectMealProduct);
  $('#confirm-meal')?.addEventListener('click', confirmSelectedMeal);

  const grams = $('#grams-input');
  if (grams) {
    grams.addEventListener('input', () => setSelectedGrams(grams.value));
    if (document.activeElement?.id !== 'grams-input') {
      // first render of selected view → focus the grams input
      grams.focus();
      grams.select();
    }
  }
}

// --- Theme -------------------------------------------------------

const THEME_KEY = 'pulse-theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved ?? (sysDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const escape = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
