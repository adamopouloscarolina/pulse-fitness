// Single render function — re-renders on every state change.
// Not optimal for big apps, but clear and easy to extend.
// Move to a framework (Lit, Preact, Svelte) when this hurts.

import {
  getState, getTotals,
  addMeal, removeMeal, joinChallenge,
  setActivePlaylist,
  saveProfile, openOnboarding, closeOnboarding,
} from './state.js';
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

        <section class="card challenge">
          <h3>Weekly challenge</h3>
          <p class="title">${c.title}</p>
          <span class="pool">Pool · ${c.pool} CRC</span>
          <div class="progress">
            <div class="progress-fill" style="width:${pct(c.progressDays, c.targetDays)}%"></div>
          </div>
          <p class="progress-text">${c.progressDays} of ${c.targetDays} days</p>
          <button class="btn" id="join-challenge" ${c.joined || !s.wallet ? 'disabled' : ''}>
            ${c.joined ? 'Joined ✓' : s.wallet ? 'Stake & join' : 'Connect wallet to join'}
          </button>
        </section>

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
    </div>
  `;

  wire();
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

  $('#add-meal')?.addEventListener('click', () => {
    const name = prompt('What did you eat?');
    if (!name) return;
    const kcal = Number(prompt('Calories?'));
    if (!kcal) return;
    const protein = Number(prompt('Protein (g)?') || 0);
    try {
      addMeal({ name, kcal, protein });
    } catch (e) {
      alert(e.message);
    }
  });

  $('#join-challenge')?.addEventListener('click', () => {
    joinChallenge().catch(() => {});
  });

  document.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeMeal(btn.getAttribute('data-remove'));
    });
  });
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
