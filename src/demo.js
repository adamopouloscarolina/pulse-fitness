// Mock data for the demo challenge flow.
// Replace with real contract state once the Solidity contract is deployed.

export const MOCK_FRIENDS = [
  { id: 'alex',  name: 'Alex Chen',    initials: 'AC', color: '#ff7a59' },
  { id: 'maria', name: 'Maria Silva',  initials: 'MS', color: '#4cc9a5' },
  { id: 'joao',  name: 'João Santos',  initials: 'JS', color: '#ffb547' },
];

export const YOU_PERSONA = {
  id: 'you', name: 'You', initials: 'YO', color: '#6c5ce7', isYou: true,
};

export const DEFAULT_CONFIG = {
  goal:         'steps',       // 'steps' | 'distance-km' | 'active-min'
  durationDays: 7,
  stakeX:       20,            // "to-win" stake in CRC
  stakeP:       10,            // "anchor" penalty deposit in CRC
};

// Generates a fresh challenge in 'lobby' state.
// You're always auto-joined; friends are auto-joined for demo speed.
export function makeMockLobby(config = DEFAULT_CONFIG) {
  const members = [
    { ...YOU_PERSONA, status: 'joined', steps: 0 },
    ...MOCK_FRIENDS.map(f => ({ ...f, status: 'joined', steps: 0 })),
  ];
  return {
    state: 'lobby',
    config,
    group: { id: 'demo-' + Date.now(), members },
    timing: null,
    settlement: null,
  };
}

// Starts the active phase. Initial step counts are seeded plausibly.
// stepsToday tracks the daily delta so the leaderboard can show
// "today's race" instead of cumulative totals.
export function activateChallenge(challenge) {
  const seeded = challenge.group.members.map(m => {
    const total = m.isYou ? 7842 : 4000 + Math.floor(Math.random() * 8000);
    return { ...m, steps: total, stepsToday: total };
  });
  return {
    ...challenge,
    state: 'active',
    group: { ...challenge.group, members: seeded },
    timing: { day: 1, totalDays: challenge.config.durationDays },
  };
}

// Bumps step counts to simulate a day passing.
// Friends get a plausible day's worth of steps; the day's delta goes
// into stepsToday. You stay where you are until you tap "+ steps".
export function tickDay(challenge) {
  if (challenge.state !== 'active') return challenge;
  const ticked = challenge.group.members.map(m => {
    if (m.isYou) return { ...m, stepsToday: 0 }; // new day, reset your daily counter
    const dayDelta = 5000 + Math.floor(Math.random() * 8000);
    return { ...m, steps: m.steps + dayDelta, stepsToday: dayDelta };
  });
  const nextDay = (challenge.timing?.day ?? 1) + 1;
  if (nextDay > challenge.config.durationDays) {
    return endChallenge({ ...challenge, group: { ...challenge.group, members: ticked }});
  }
  return {
    ...challenge,
    group: { ...challenge.group, members: ticked },
    timing: { ...challenge.timing, day: nextDay },
  };
}

export function bumpYourSteps(challenge, delta) {
  if (challenge.state !== 'active') return challenge;
  const members = challenge.group.members.map(m =>
    m.isYou
      ? { ...m, steps: Math.max(0, m.steps + delta), stepsToday: Math.max(0, (m.stepsToday ?? 0) + delta) }
      : m
  );
  return { ...challenge, group: { ...challenge.group, members }};
}

// Sort by steps desc → assign ranks → compute payouts via anchor math.
export function computeRanking(members) {
  return [...members]
    .sort((a, b) => b.steps - a.steps)
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

// Anchor payout (per spec):
//   1st     → +(N-1)X + P  net
//   middle  → -X
//   last    → -(X + P)
export function computePayouts(rankedMembers, { stakeX, stakeP }) {
  const N = rankedMembers.length;
  return rankedMembers.map(m => {
    let net = 0;
    if (m.rank === 1)         net =  (N - 1) * stakeX + stakeP;
    else if (m.rank === N)    net = -(stakeX + stakeP);
    else                      net = -stakeX;
    return { ...m, payout: net };
  });
}

export function endChallenge(challenge) {
  const ranked = computeRanking(challenge.group.members);
  const settled = computePayouts(ranked, challenge.config);
  return {
    ...challenge,
    state: 'ended',
    group: { ...challenge.group, members: settled },
    settlement: {
      rankings: settled,
      claimed: false,
    },
  };
}

export function resetChallenge() {
  return {
    state: 'idle',
    config: null,
    group: null,
    timing: null,
    settlement: null,
  };
}
