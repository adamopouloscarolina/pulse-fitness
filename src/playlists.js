// Apple Music playlists for the Soundtrack card.
//
// HOW TO ADD YOUR OWN PLAYLISTS
//
//   1. Open the Apple Music app or music.apple.com
//   2. Find the playlist you want, click "Share" → "Copy Link"
//   3. The URL looks like:
//        https://music.apple.com/us/playlist/<name>/pl.<id>
//   4. Convert it to an embed URL by changing "music.apple.com"
//      to "embed.music.apple.com":
//        https://embed.music.apple.com/us/playlist/<name>/pl.<id>
//   5. Paste it below.
//
// Tip: Apple's own curated playlists work well as starting points —
// search for "Running" or "Walking" in Apple Music for high-BPM and
// chill picks respectively.

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
