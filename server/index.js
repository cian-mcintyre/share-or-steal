import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.get('/health', (_, res) => res.send('ok'));

const server = http.createServer(app);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const io = new Server(server, { cors: { origin: FRONTEND_ORIGIN } });

// In-memory state (replace with Redis/Postgres in prod)
const waitingByLocation = new Map(); // locationId -> [socketId]
const matches = new Map();          // matchId -> matchState

const DECISION_MS = 20_000;

io.on('connection', (socket) => {
  socket.on('join_location', ({ locationId, playerName }) => {
    socket.data = { locationId, playerName: playerName || 'Player' };

    if (!waitingByLocation.has(locationId)) waitingByLocation.set(locationId, []);
    const queue = waitingByLocation.get(locationId);

    // If someone is waiting, pair them
    if (queue.length > 0) {
      const partnerId = queue.shift();
      const partner = io.sockets.sockets.get(partnerId);
      if (!partner) {
        // partner disappeared — requeue
        queue.push(socket.id);
        socket.emit('queued', { position: queue.length });
        return;
      }
      createMatch(partner, socket);
    } else {
      // enqueue
      queue.push(socket.id);
      socket.emit('queued', { position: queue.length });
      // Clean up if they disconnect while queued
      socket.on('disconnect', () => {
        const q = waitingByLocation.get(locationId) || [];
        const idx = q.indexOf(socket.id);
        if (idx !== -1) q.splice(idx, 1);
      });
    }
  });

  socket.on('submit_choice', ({ matchId, choice }) => {
    const match = matches.get(matchId);
    if (!match) return socket.emit('error', { message: 'Match not found' });
    if (!['share', 'steal'].includes(choice)) return;

    if (socket.id === match.a.id) match.a.choice = choice;
    else if (socket.id === match.b.id) match.b.choice = choice;
    else return socket.emit('error', { message: 'Not part of this match' });

    socket.emit('choice_recorded', { matchId });
    maybeFinish(matchId);
  });

  socket.on('disconnect', () => {
    // If disconnected mid‑match, cancel match and requeue opponent
    for (const [matchId, match] of matches) {
      if (match.finished) continue;
      if (match.a.id === socket.id || match.b.id === socket.id) {
        const survivorId = match.a.id === socket.id ? match.b.id : match.a.id;
        const survivor = io.sockets.sockets.get(survivorId);
        if (survivor) {
          survivor.emit('requeue', { reason: 'Opponent disconnected' });
          // requeue survivor in the same location
          const loc = match.locationId;
          if (!waitingByLocation.has(loc)) waitingByLocation.set(loc, []);
          waitingByLocation.get(loc).push(survivorId);
        }
        matches.delete(matchId);
      }
    }
  });
});

function createMatch(sockA, sockB) {
  const matchId = uuidv4();
  const locationId = sockA.data.locationId; // both are same by construction
  const deadline = Date.now() + DECISION_MS;
  const match = {
    id: matchId,
    locationId,
    a: { id: sockA.id, name: sockA.data.playerName, choice: null },
    b: { id: sockB.id, name: sockB.data.playerName, choice: null },
    deadline,
    finished: false,
    timer: setTimeout(() => maybeFinish(matchId), DECISION_MS + 250)
  };
  matches.set(matchId, match);

  sockA.emit('match_found', { matchId, opponent: { id: sockB.id, name: match.b.name }, decisionDeadline: deadline });
  sockB.emit('match_found', { matchId, opponent: { id: sockA.id, name: match.a.name }, decisionDeadline: deadline });
}

function maybeFinish(matchId) {
  const match = matches.get(matchId);
  if (!match || match.finished) return;
  const now = Date.now();
  const a = match.a.choice || (now > match.deadline ? 'steal' : null);
  const b = match.b.choice || (now > match.deadline ? 'steal' : null);
  if (a && b) {
    match.finished = true;
    clearTimeout(match.timer);
    const { outcome, aPrize, bPrize } = computeOutcomeAndPrizes(a, b);
    const sockA = io.sockets.sockets.get(match.a.id);
    const sockB = io.sockets.sockets.get(match.b.id);
    if (sockA) sockA.emit('result', { matchId: match.id, yourChoice: a, theirChoice: b, yourPrizeCode: aPrize || null });
    if (sockB) sockB.emit('result', { matchId: match.id, yourChoice: b, theirChoice: a, yourPrizeCode: bPrize || null });
    matches.delete(matchId);
  }
}

function computeOutcomeAndPrizes(a, b) {
  // Prize logic: return codes for winners. For MVP just use pseudo codes.
  const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  if (a === 'share' && b === 'share') return { outcome: 'SS', aPrize: `P-${code()}`, bPrize: `P-${code()}` };
  if (a === 'share' && b === 'steal') return { outcome: 'ST', aPrize: null, bPrize: `P-${code()}-BOTH` };
  if (a === 'steal' && b === 'share') return { outcome: 'TS', aPrize: `P-${code()}-BOTH`, bPrize: null };
  return { outcome: 'TT', aPrize: null, bPrize: null };
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server on :' + PORT));
