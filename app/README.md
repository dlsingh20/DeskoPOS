# DeskoPOS app

The point-of-sale screens restaurant staff use: tables, orders and KOTs, billing, Credit Pay, cash counters, History, Reports, menu and table setup, users and roles, print settings. It talks only to the DeskoPOS service in this repository (`../`).

React 18 + Chakra UI, Create React App.

## Run locally

Start the service first (see the main README; it listens on http://localhost:8001), then:

```bash
cd app
npm install
npm run dev      # http://localhost:3001 (settings in .env.development)
npm test
```

Sign in with a client user's login ID. The login page is the same for every client; the login ID tells the service which client it is.

## Build for a server

```bash
cp .env.example .env.production.local   # fill in the service address
npm run build                           # static files in build/
npm start                               # serves build/ on $PORT (default 3005)
```

| Setting | What it is |
|---|---|
| `REACT_APP_API_BASE_URL` | DeskoPOS service address (required) |
| `REACT_APP_TURNSTILE_SITEKEY` | Cloudflare Turnstile key for the sign-in captcha; empty = no captcha. Pair it with `TURNSTILE_SECRET` on the service. |
| `REACT_APP_GUEST_APP_URL` | Guest ordering page for table QR codes; empty = table QR codes are hidden (DeskoPOS has no guest ordering page yet) |

## Notes

- The app came from the StayDesko hotel POS. It now always runs against DeskoPOS (`src/services/backend.js`); code behind `!IS_DESKOPOS` is the old hotel path, kept only until it is removed.
- Not available yet: Guest Visit (charge to a hotel room; answers "not set up"), guest QR ordering, live updates between devices (the app refreshes on a timer).
- `docs/` holds the feature notes (History, Reports, Tables & QR, Users & Roles, Products) and `MISSING_APIS.md`, the API contract the service follows.
