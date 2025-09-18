import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export default function App() {
  const params = new URLSearchParams(location.search);
  const locationId = params.get('loc') || 'demo';

  const [status, setStatus] = useState('Connecting…');
  const [connected, setConnected] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  const [opponent, setOpponent] = useState(null);
  const [matchId, setMatchId] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [choice, setChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [name, setName] = useState('');

  const socketRef = useRef(null);

  const secondsLeft = useCountdown(deadline);

  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      setStatus('Enter your name and press GO to start');
    });

    s.on('queued', ({ position }) =>
      setStatus(`Waiting in queue… (#${position})`)
    );

    s.on('match_found', ({ matchId, opponent, decisionDeadline }) => {
      setMatchId(matchId);
      setOpponent(opponent);
      setDeadline(decisionDeadline);
      setStatus('Opponent found! Make your choice.');
    });

    s.on('choice_recorded', () =>
      setStatus('Choice locked. Waiting for opponent…')
    );

    s.on('result', (payload) => {
      setResult(payload);
      setStatus('Round finished.');
    });

    s.on('requeue', ({ reason }) => {
      setStatus(`${reason}. Re-queued…`);
      setMatchId(null);
      setOpponent(null);
      setDeadline(null);
      setChoice(null);
      setResult(null);
      // Remain joined; server will requeue us automatically
    });

    s.on('error', ({ message }) => setStatus('Error: ' + message));

    return () => s.disconnect();
  }, [locationId]);

const start = () => {
  if (!connected || hasJoined || !name.trim()) return;
  socketRef.current.emit('join_location', { locationId, playerName: name.trim() });
  setHasJoined(true);
  setStatus('Joined. Waiting for an opponent…');
};

  const submit = (c) => {
    if (!matchId || result) return;
    setChoice(c);
    socketRef.current.emit('submit_choice', { matchId, choice: c });
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Share or Steal</h1>
        <p className="subtitle">A quick, location-based Prisoner’s Dilemma</p>
      </header>

      <section className="card">
        <div className="row">
          <span className="label">Location:</span>
          <span className="value">{locationId}</span>
        </div>

        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <label className="label" htmlFor="name">Your name:</label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Type your name"
          />
          <button
            className="btn btn--share"
            onClick={start}
            disabled={!connected || hasJoined || !name.trim()}
            title={!connected ? 'Connecting…' : (!name.trim() ? 'Enter your name' : 'Start')}
          >
            GO
          </button>
        </div>

        <p style={{ marginTop: 10 }}><em>{status}</em></p>
      </section>

      {!result && opponent && (
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <p>Opponent: <strong className="value">{opponent.name || 'Anonymous'}</strong></p>
            <div className="countdown">{Math.max(0, secondsLeft)}s</div>
          </div>
          <div className="btns" style={{ marginTop: 8 }}>
            <button className="btn btn--share" disabled={!!choice} onClick={() => submit('share')}>Share</button>
            <button className="btn btn--steal" disabled={!!choice} onClick={() => submit('steal')}>Steal</button>
          </div>
        </section>
      )}

      {result && (
        <section className="card">
          <h3 className="result-title">Results</h3>
          <p style={{ marginTop: 0, marginBottom: 10 }}>
            {resultMessage(result.yourChoice, result.theirChoice)}
          </p>
          <p>You chose: <strong className="value">{result.yourChoice}</strong></p>
          <p>They chose: <strong className="value">{result.theirChoice}</strong></p>

          {result.yourPrizeCode ? (
            <p>Prize code: <span className="code">{result.yourPrizeCode}</span></p>
          ) : (
            <p className="label">No prize code this round.</p>
          )}

          <div className="btns" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => location.reload()}>Play Again</button>
          </div>
        </section>
      )}

      <section className="card details">
        <details>
          <summary>How it works</summary>
          <ol>
            <li>Enter your name and press GO.</li>
            <li>Wait to be matched with someone nearby.</li>
            <li>Pick Share or Steal. Once picked, it’s locked.</li>
            <li>Results and prize codes appear instantly.</li>
          </ol>
        </details>
      </section>
    </div>
  );
}

function resultMessage(your, their) {
  if (your === 'share' && their === 'share') {
    return "Congrats! You've won a pint each 🍻";
  }
  if (your === 'steal' && their === 'share') {
    return "You sneaky devil! You've stolen two pints. 🍺🍺";
  }
  if (your === 'share' && their === 'steal') {
    return "You've been robbed! No pints for you";
  }
  return "You both got greedy. No pints for anyone 😭";
}

function useCountdown(deadline) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setT(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return t;
}