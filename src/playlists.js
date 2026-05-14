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

export const PLAYLISTS = {
  walk: {
    title: 'Walk',
    emoji: '🚶',
    tagline: '10k steps before you check your watch.',
    meta: 'Steady 100–120 BPM · ~45 min',
    // Paste your walking playlist embed URL here:
    embedUrl: '',
  },
  run: {
    title: 'Run',
    emoji: '🏃',
    tagline: 'Run a 5K like it\'s a 3K.',
    meta: '150–170 BPM · ~35 min',
    // Paste your running playlist embed URL here:
    embedUrl: '',
  },
};
