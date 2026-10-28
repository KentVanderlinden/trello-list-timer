# List Timer for Trello

A Trello Power-Up that adds up how long each card has spent in the lists you choose.

- **Track any lists**, for example "Working on it" and "On hold".
- **Main lists** (star them, as many as you like) show their total right on the card, e.g. `⏱ Working on it · 3h 12m`. The badge turns colored while the card is in that list and updates every minute.
- **Open a card** to see the "Time in lists" section with every tracked list: total time, number of visits, and whether the clock is running.
- **Count 24/7 or only during set hours** (per weekday, with time zone; night shifts like 22:00–06:00 work).

Times come from Trello's own record of card moves, so moves made on your phone, by teammates, or before you installed the Power-Up all count. Archived cards and cards moved to another board stop counting.

## Setup

1. **Host it.** Push this repo to GitHub (public), then open *Settings → Pages* and choose *Deploy from a branch → main → / (root)*. Your URL will be `https://<you>.github.io/<repo>/`.
2. **Register the Power-Up.** Go to https://trello.com/power-ups/admin, choose your Workspace, and click *New*:
   - **Iframe connector URL:** your Pages URL (ending in `/`).
   - Save, then open the **Capabilities** tab and switch on: *Authorization status, Board buttons, Card back section, Card badges, Card detail badges, Show authorization, Show settings*.
   - Open the **API key** tab, click *Generate a new API key*, and add your Pages origin (`https://<you>.github.io`) under *Allowed origins*.
3. **Add the key.** Paste the API key into `js/config.js` (`API_KEY = '...'`), commit and push.
4. **Turn it on.** On your board: *Power-Ups → Custom → List Timer → Add*. Click the **List Timer** button at the top of the board to pick your lists and how time counts, then click **Authorize** once.

## Development

- `npm test` runs the logic tests (move history → time per list, working-hours math, formatting).
- `node dev/preview.mjs [outDir]` renders the settings popup and card section with a fake Trello (`dev/mock-trello.js`) and saves screenshots. It needs Playwright.

Everything is plain HTML/CSS/JS with no build step:

| File | What it does |
| --- | --- |
| `index.html`, `js/connector.js` | Registers the badges, card section, board button and settings with Trello |
| `js/history.js` | Fetches and caches the board's card-move history from the Trello API |
| `js/intervals.js` | Turns that history into "in list X from A to B" intervals |
| `js/time.js` | Totals, working-hours schedule math, duration formatting |
| `js/stats.js` | Combines the above for one card |
| `settings.html`, `js/settings.js` | Settings popup |
| `card-section.html`, `js/card-section.js` | "Time in lists" section on the back of a card |
| `auth.html` | Authorize popup |
