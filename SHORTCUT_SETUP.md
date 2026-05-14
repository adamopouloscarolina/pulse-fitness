# Apple Health → Pulse Shortcut setup

A 5-minute one-time setup so Pulse can read your iPhone's daily step count.

## What you're building

A Shortcut on your iPhone that:
1. Asks Apple Health "how many steps did I take today?"
2. POSTs that number to Pulse's local API endpoint
3. (Optional) Runs automatically once a day

## Before you start

- **Both devices on the same WiFi.** The Shortcut talks to your Mac over the LAN.
- **Pulse dev server must be running.** Start with `npm run dev` if it isn't.
- **Your Mac's IP right now:** `192.168.1.50` *(if your WiFi changes this number changes — get the new one with `ifconfig en0 | grep "inet "` on your Mac).*
- **API endpoint URL:** `http://192.168.1.50:5173/api/health-steps`

## Build the Shortcut (on your iPhone)

1. Open the **Shortcuts** app on your iPhone.
2. Tap the **+** (top right) to create a new shortcut.
3. Tap **Add Action** and add the following **three** actions in order:

### Action 1 — Find Health Sample (steps today)

- Tap "Add Action"
- Search **"Find Health Sample"**
- Tap it to add
- Configure:
   - **Sample Type**: `Steps`
   - **Sort By**: `Start Date`
   - **Order**: `Latest First`
- Tap "Add Filter":
   - **Date** is `Today`

### Action 2 — Calculate the total (sum of step samples)

- Add a new action: search **"Get Numbers from Input"**
- It should auto-fill with the Health Samples from Action 1.
- Add another action: search **"Calculate Statistics"**
- Configure:
   - **Mode**: `Sum`
   - Input: `Numbers` (the output of the previous action)

This gives you a single number = today's total steps.

### Action 3 — POST to Pulse

- Add a new action: search **"Get contents of URL"**
- Configure:
   - **URL**: `http://192.168.1.50:5173/api/health-steps`
   - Tap "Show More" to expand options
   - **Method**: `POST`
   - **Headers**: add one — Key: `Content-Type`, Value: `application/json`
   - **Request Body**: `JSON`
   - Add field — Key: `steps`, Value: tap the magic-variable button and pick the `Calculate Statistics` result (the sum from Action 2)

### Name the Shortcut

- Tap the title at top → name it **"Sync Pulse Steps"**
- Tap the icon → pick a color/emoji (👟 is appropriate)
- Tap **Done**

## Test it

1. Make sure Pulse dev server is running on your Mac (`npm run dev`).
2. On your iPhone, run the Shortcut: tap the Shortcuts app → tap **"Sync Pulse Steps"**.
3. iOS may ask "Allow this Shortcut to access Health data" — say yes.
4. iOS may ask "Allow this Shortcut to send data to http://192.168.1.50:5173" — say yes.
5. The Shortcut should run silently (or show a brief notification, depending on settings).
6. Switch to your Mac browser, refresh `http://localhost:5173/`. The Steps card should now show your real step count and "📱 iPhone Health · just now".

## Set it to run automatically (optional but recommended)

Once it works manually, automate it so steps sync without you having to tap anything:

1. Shortcuts app → tap **Automation** tab (bottom).
2. Tap **+** → **Create Personal Automation**.
3. Pick a trigger:
   - **Time of Day** → choose a time (e.g. 11:55 PM each day for end-of-day sync)
   - Or **App** → opens Pulse-in-Safari → auto-syncs whenever you visit Pulse
   - Or **NFC tag** → tap your phone on a sticker on your fridge to sync (extremely satisfying)
4. **Next** → **Add Action** → search **"Run Shortcut"** → pick **"Sync Pulse Steps"**.
5. Toggle off **"Ask Before Running"** (otherwise iOS confirms each time).
6. Done.

## Troubleshooting

**"The shortcut ran but Pulse didn't update"**
- Make sure your Mac's IP hasn't changed. Run `ifconfig en0 | grep "inet "` on the Mac and update the URL in the Shortcut if needed.
- Check that Vite is running (`npm run dev` shows "ready" message).
- Test the endpoint directly from your iPhone's Safari: visit `http://192.168.1.50:5173/api/health-steps` — should show JSON.

**"iOS blocks the HTTP connection"**
- iOS sometimes refuses non-HTTPS local network traffic. Workaround: switch your Mac to serve over HTTPS (later) or use a free tunnel like `ngrok http 5173` and put the ngrok HTTPS URL in your Shortcut instead.

**"The Shortcut throws an error about Find Health Sample"**
- Apple Health needs at least one step sample for the day. Take a walk first 😄

## What happens behind the scenes

```
iPhone Health (steps) 
   ↓  (Find Health Sample + Calculate Statistics)
Sum: 8,432
   ↓  (POST as JSON to /api/health-steps)
Vite dev server middleware
   ↓  (stored in memory: { steps: 8432, syncedAt: 1778760034743 })
Pulse browser app
   ↓  (polls GET /api/health-steps every 10s)
Steps card updates with "📱 iPhone Health · just now"
```

## Production note

In-memory storage = restart Vite, the sync vanishes. For real deployment we'd:
1. Move the endpoint to a Vercel/Cloudflare serverless function.
2. Store per-user data in a real DB (Vercel KV / Cloudflare D1).
3. Add a per-user auth token in the Shortcut header so others can't push fake steps for you.
4. Switch to HTTPS (Vercel/Cloudflare give this free) which also makes iOS happier about non-LAN connections.
