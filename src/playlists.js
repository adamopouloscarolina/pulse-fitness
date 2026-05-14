// Playlists for the Soundtrack card.
//
// Any music service with an embed widget works — Spotify, Tidal,
// Apple Music, YouTube, SoundCloud. Paste any of the URL formats
// below into embedUrl and the card will render it.
//
//   Spotify       https://open.spotify.com/embed/playlist/<id>
//   Tidal         https://embed.tidal.com/playlists/<id>
//   Apple Music   https://embed.music.apple.com/<country>/playlist/<name>/<id>
//   YouTube       https://www.youtube.com/embed/videoseries?list=<id>
//   SoundCloud    https://w.soundcloud.com/player/?url=<encoded-url>
//
// For most services: find the playlist, hit "Share → Copy Link",
// then swap the domain for the embed domain (see table above).

// Pace constants used to project distance/steps for each playlist.
// Edit these per playlist if you want to fine-tune for a specific user.
const WALK = { paceKmh: 5,  cadenceSpm: 110 };
const RUN  = { paceKmh: 10, cadenceSpm: 170 };

export const PLAYLISTS = {
  walk: {
    title: 'Walk',
    emoji: '🚶',
    tagline: '10k steps before you check your watch.',
    meta: 'Steady 100–120 BPM',
    durationMin: 45,
    ...WALK,
    // Tidal: tidal.com/playlist/<id> → embed.tidal.com/playlists/<id>
    embedUrl: 'https://embed.tidal.com/playlists/84ce75e6-534f-4e71-9062-2a1f895aaacf',
  },
  run: {
    title: 'Run',
    emoji: '🏃',
    tagline: 'Run a 5K like it\'s a 3K.',
    meta: '150–170 BPM',
    durationMin: 35,
    ...RUN,
    // Paste your running playlist embed URL here:
    embedUrl: '',
  },
};

// Given a playlist, returns { km, steps } you'd cover listening end-to-end.
export function projectActivity({ durationMin, paceKmh, cadenceSpm }) {
  const km    = (durationMin * paceKmh) / 60;
  const steps = durationMin * cadenceSpm;
  return { km, steps };
}
