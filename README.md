# Love Reminder — love-reminder-ext

A tiny Chrome/Edge/Firefox extension that sends you sweet, gentle reminders to take care of yourself. Think water, stretch, rest your eyes, and goodnight — on your terms, with quiet hours and snooze.

## What it does

- Four gentle starter reminders (water, posture, eyes, goodnight)
- Interval or fixed-time ("every X min", or at HH:MM)
- Quiet hours — it'll shush during the window you pick (e.g. 23:30–07:00)
- Snooze for a few minutes, or tap "I'm here ♥"
- A pool of sweet lines, picked at random
- Badge shows how many reminders are enabled
- Test it from the popup, or let the alarms handle it
- No tracking, no network calls — everything stays on your device
- MV3, works in Chrome, Edge and Firefox

## Files

- `manifest.chrome.json` / `manifest.firefox.json` — the two MV3 manifests
- `src/common/api.js` — `api = browser || chrome` helper
- `src/common/data.js` — pure helpers + defaults + normaliser
- `src/common/theme.css` — tiny shared styles
- `src/background.js` — alarm scheduler, notifications, snooze, quiet hours
- `src/popup/popup.html/.css/.js` — quick controls + test
- `src/options/options.html/.css/.js` — edit reminders, quiet hours, messages
- `icons/` — heart icons (SVG + 16/32/48/128 PNG)
- `tools/make-icons.js` — dependency-free icon generator
- `test/harness.js` — Node test suite
- `LICENSE`, `.gitignore`

## Try it

1. **Firefox (temporary add-on):**
   - Copy `manifest.firefox.json` to `manifest.json` (or just load it)
   - Open `about:debugging#/runtime/this-firefox`
   - "Load Temporary Add-on…" → pick the folder (or `manifest.firefox.json`)

2. **Chrome / Edge (unpacked):**
   - Copy `manifest.chrome.json` to `manifest.json`
   - Open `chrome://extensions` (Developer mode ON)
   - "Load unpacked" → pick this folder
   - Click the heart icon to test, or right-click → Options

3. **Node tests (no browser needed):**
   ```powershell
   cd C:\Users\PC\Sneppx-main\love-reminder-ext
   node --check src/background.js src/common/data.js src/popup/popup.js src/options/options.js
   node test/harness.js
   ```

## Notes

- In a real service worker (Chrome) `importScripts` pulls in the shared files; the harness and Firefox (event page) run them directly.
- Alarm names: `reminder:<id>` for intervals, `reminder:<id>:<HH:MM>` for fixed times; snooze alarms: `snooze:<id>`.
- The quiet window wraps past midnight (e.g. 23:30 → 07:00).
- No build step. Vanilla JS.

Made with love, just for Mena.
