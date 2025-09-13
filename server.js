import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import crypto from 'crypto';

const app = express();
app.use(express.static('.'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Room state management
// roomId -> { players: { goat: ws|null, tiger: ws|null }, state: serialized, turn, goatsToPlace, goatsCaptured, board:Array(25), winner }
const rooms = new Map();

function generateRoomId() {
  // Codes formatted as SANR00 .. SANR99. Try random selection then fallback sequential.
  const prefix = 'SANR';
  if (rooms.size >= 100) {
    // All codes in use; extremely unlikely for casual play. Fallback random 2-char hex.
    return prefix + Math.floor(Math.random()*100).toString().padStart(2,'0');
  }
  // Attempt up to 20 random picks
  for (let attempt=0; attempt<20; attempt++) {
    const n = Math.floor(Math.random()*100);
    const code = prefix + n.toString().padStart(2,'0');
    if (!rooms.has(code)) return code;
  }
  // Deterministic fallback: find first free
  for (let n=0;n<100;n++) {
    const code = prefix + n.toString().padStart(2,'0');
    if (!rooms.has(code)) return code;
  }
  // Ultimate fallback (should never reach here)
  return prefix + '00';
}

function createInitialState() {
  return {
    board: [2,0,0,0,2, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 2,0,0,0,2],
    goatsToPlace: 20,
    goatsCaptured: 0,
    turn: 'goat',
    winner: null
  };
}

function serializeState(room) {
  const { board, goatsToPlace, goatsCaptured, turn, winner } = room.state;
  return { board, goatsToPlace, goatsCaptured, turn, winner };
}

function broadcast(roomId, obj) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const role of ['goat','tiger']) {
    const ws = room.players[role];
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }
}

function validateMove(state, move) {
  // Minimal server validation to prevent illegal moves (mirrors client rules simplified)
  const ADJ = getAdjacency();
  if (state.winner) return false;
  if (state.turn === 'goat') {
    if (move.type === 'place') {
      if (state.goatsToPlace <= 0) return false;
      if (state.board[move.to] !== 0) return false;
      return true;
    }
    if (move.type === 'move') {
      if (state.goatsToPlace > 0) return false;
      if (state.board[move.from] !== 1) return false;
      if (state.board[move.to] !== 0) return false;
      if (!ADJ[move.from].includes(move.to)) return false;
      return true;
    }
    return false;
  } else {
    if (move.type === 'move') {
      if (state.board[move.from] !== 2) return false;
      if (state.board[move.to] !== 0) return false;
      if (!ADJ[move.from].includes(move.to)) return false;
      return true;
    }
    if (move.type === 'capture') {
      if (state.board[move.from] !== 2) return false;
      if (state.board[move.over] !== 1) return false;
      if (state.board[move.to] !== 0) return false;
      if (!ADJ[move.from].includes(move.over)) return false;
      const landing = landingFromJump(move.from, move.over, ADJ);
      if (landing !== move.to) return false;
      return true;
    }
    return false;
  }
}

function applyMove(state, move) {
  if (state.turn === 'goat') {
    if (move.type === 'place') {
      state.board[move.to] = 1; state.goatsToPlace--; state.turn = 'tiger';
    } else if (move.type === 'move') {
      state.board[move.from] = 0; state.board[move.to] = 1; state.turn = 'tiger';
    }
  } else {
    if (move.type === 'move') {
      state.board[move.from] = 0; state.board[move.to] = 2; state.turn = 'goat';
    } else if (move.type === 'capture') {
      state.board[move.from] = 0; state.board[move.over] = 0; state.board[move.to] = 2; state.goatsCaptured++; state.turn = 'goat';
    }
  }
  updateWinner(state);
}

function updateWinner(state) {
  if (state.goatsCaptured >= 5) { state.winner = 'tiger'; return; }
  // Tiger mobility check
  const ADJ = getAdjacency();
  let anyTigerMove = false;
  for (let i=0;i<25;i++) if (state.board[i] === 2) {
    for (const n of ADJ[i]) {
      if (state.board[n] === 0) { anyTigerMove = true; break; }
      if (state.board[n] === 1) {
        const landing = landingFromJump(i, n, ADJ);
        if (landing != null && state.board[landing] === 0) { anyTigerMove = true; break; }
      }
    }
    if (anyTigerMove) break;
  }
  if (!anyTigerMove) state.winner = 'goat';
}

function landingFromJump(src, over, ADJ) {
  // Compute landing by vector doubling, ensure adjacency chain
  const sr = Math.floor(src/5), sc = src%5;
  const or = Math.floor(over/5), oc = over%5;
  const dr = or - sr, dc = oc - sc;
  const lr = or + dr, lc = oc + dc;
  if (lr<0||lr>=5||lc<0||lc>=5) return null;
  const landing = lr*5+lc;
  if (!ADJ[src].includes(over)) return null;
  if (!ADJ[over].includes(landing)) return null;
  return landing;
}

let cachedAdj = null;
function getAdjacency() {
  if (cachedAdj) return cachedAdj;
  const adj = Array.from({length:25},()=>[]);
  const inB=(r,c)=>r>=0&&r<5&&c>=0&&c<5;
  for (let r=0;r<5;r++) for (let c=0;c<5;c++) {
    const i=r*5+c;
    for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nr=r+dr,nc=c+dc; if(inB(nr,nc)) adj[i].push(nr*5+nc); }
    if ((r+c)%2===0) {
      for (const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) { const nr=r+dr,nc=c+dc; if(inB(nr,nc)) adj[i].push(nr*5+nc); }
    }
  }
  cachedAdj = adj;
  return adj;
}

function assignRole(room, preferred) {
  if (preferred && !room.players[preferred]) return preferred;
  if (!room.players.goat) return 'goat';
  if (!room.players.tiger) return 'tiger';
  return null;
}

wss.on('connection', (ws) => {
  ws.id = crypto.randomUUID();
  ws.roomId = null;
  ws.role = null;

  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (msg.type === 'create') {
      const roomId = generateRoomId();
      rooms.set(roomId, { players: { goat:null, tiger:null }, state: createInitialState() });
      ws.roomId = roomId; ws.role = assignRole(rooms.get(roomId), msg.preferredRole);
      rooms.get(roomId).players[ws.role] = ws;
      ws.send(JSON.stringify({ type:'created', roomId, role: ws.role, state: serializeState(rooms.get(roomId)) }));
    } else if (msg.type === 'join') {
      const { roomId, preferredRole } = msg;
      const room = rooms.get(roomId);
      if (!room) { ws.send(JSON.stringify({ type:'error', error:'Room not found'})); return; }
      const role = assignRole(room, preferredRole);
      if (!role) { ws.send(JSON.stringify({ type:'error', error:'Room full'})); return; }
      ws.roomId = roomId; ws.role = role; room.players[role] = ws;
      ws.send(JSON.stringify({ type:'joined', roomId, role, state: serializeState(room) }));
      broadcast(roomId, { type:'players', players: {
        goat: !!room.players.goat,
        tiger: !!room.players.tiger
      }});
    } else if (msg.type === 'move') {
      const room = rooms.get(ws.roomId); if (!room) { ws.send(JSON.stringify({ type:'error', error:'No room' })); return; }
      if (room.state.turn !== ws.role) { ws.send(JSON.stringify({ type:'error', error:'Not your turn' })); return; }
      if (!validateMove(room.state, msg.move)) { ws.send(JSON.stringify({ type:'error', error:'Invalid move' })); return; }
      applyMove(room.state, msg.move);
      broadcast(ws.roomId, { type:'state', state: serializeState(room), lastMove: msg.move });
    } else if (msg.type === 'restart') {
      const room = rooms.get(ws.roomId); if (!room) return;
      room.state = createInitialState();
      broadcast(ws.roomId, { type:'state', state: serializeState(room), restart:true });
    } else if (msg.type === 'leave') {
      cleanup(ws);
    }
  });

  ws.on('close', () => cleanup(ws));
});

function cleanup(ws) {
  const roomId = ws.roomId; if (!roomId) return;
  const room = rooms.get(roomId); if (!room) return;
  if (room.players.goat === ws) room.players.goat = null;
  if (room.players.tiger === ws) room.players.tiger = null;
  broadcast(roomId, { type:'players', players: { goat: !!room.players.goat, tiger: !!room.players.tiger } });
  // Auto-delete empty room
  if (!room.players.goat && !room.players.tiger) rooms.delete(roomId);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
