# Prisoners Dilemma — MVP

This is a ready-to-run MVP for a location-based Share/Steal game.

## Prereqs
- Node.js LTS installed (v20+)
- (Optional) Git installed

## Install & Run (from project root)

### 1) Server
```bash
cd server
npm install
npm run dev   # or: npm start
```
Server listens on: http://localhost:3001

### 2) Client (new terminal)
```bash
cd client
npm install
npm run dev
```
Open the printed URL (likely http://localhost:5173). For a quick demo, open two browser windows at:
```
http://localhost:5173/?loc=demo
```
Pick names and play a round.

## Notes
- Edit decision window in `server/index.js` via `DECISION_MS`.
- Environment override for client → `.env` (`VITE_SERVER_URL`).
- In-memory state only — not for production; see the larger spec for Postgres/Redis & anti-cheat.
