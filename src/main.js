import { GameState } from './gamestate.js';
import { PIECE } from './constants.js';
import { ADJACENCY } from './board.js';
import { chooseAIMove, DIFFICULTY_PRESETS } from './ai.js';
import { MultiplayerClient } from './multiplayer.js';

let state = new GameState();
let playerConfig = { goat: 'human', tiger: 'unbeatable' }; // default 1P: human goats vs unbeatable tiger
let currentMode = '1p'; // '1p' | '2p' | 'online'
let onlineRole = null; // player's assigned role in online game
const mp = new MultiplayerClient();
let onlineConnected = false;
let onlinePending = false; // waiting for server confirmation after sending move

const svg = document.getElementById('board');
const turnDisplay = document.getElementById('turnDisplay');
const goatsToPlaceEl = document.getElementById('goatsToPlace');
const goatsCapturedEl = document.getElementById('goatsCaptured');
// Mobile status mirrors
const turnDisplayMobile = document.getElementById('turnDisplayMobile');
const goatsToPlaceMobile = document.getElementById('goatsToPlaceMobile');
const goatsCapturedMobile = document.getElementById('goatsCapturedMobile');
const messageEl = document.getElementById('message');
const restartBtn = document.getElementById('restartBtn');
const modeRadios = document.querySelectorAll('input[name="modeSelect"]');
const humanSideSelect = document.getElementById('humanSideSelect');
// Online elements
const onlineOptions = document.getElementById('onlineOptions');
const onlineSideSelect = document.getElementById('onlineSideSelect');
const roomCodeInput = document.getElementById('roomCodeInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const onlineStatus = document.getElementById('onlineStatus');
const shareLinkWrapper = document.getElementById('shareLinkWrapper');
const shareLink = document.getElementById('shareLink');
// Removed difficulty / apply controls; fixed opponent difficulty = hard
const singlePlayerOptions = document.getElementById('singlePlayerOptions');
const captureOverlay = document.getElementById('captureOverlay');
// Winner overlay elements
const winnerOverlay = document.getElementById('winnerOverlay');
const winnerImage = document.getElementById('winnerImage');
const winnerTitle = document.getElementById('winnerTitle');
const winnerReason = document.getElementById('winnerReason');
const playAgainBtn = document.getElementById('playAgainBtn');

const coord = index => ({ x: (index % 5) * 100 + 50, y: Math.floor(index / 5) * 100 + 50 });

function drawBoardLines() {
  // Derive all edges from adjacency (avoid duplicates by enforcing i < j)
  for (let i = 0; i < ADJACENCY.length; i++) {
    const { x: x1, y: y1 } = coord(i);
    for (const j of ADJACENCY[i]) {
      if (j > i) { // draw each undirected edge once
        const { x: x2, y: y2 } = coord(j);
        line(x1, y1, x2, y2);
      }
    }
  }
}

function line(x1, y1, x2, y2) {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  l.setAttribute('class', 'line');
  svg.appendChild(l);
}

function clearSVG() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function render() {
  clearSVG();
  drawBoardLines();
  // Render nodes baselines
  for (let i = 0; i < 25; i++) {
    const { x, y } = coord(i);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', 16);
    circle.setAttribute('class', 'node ' + (state.board[i] === PIECE.EMPTY ? 'empty' : '')); 
    circle.addEventListener('click', () => onNodeClick(i));
    svg.appendChild(circle);
  }
  // Pieces (image-based if assets present, fallback to circle)
  for (let i = 0; i < 25; i++) {
    if (state.board[i] === PIECE.EMPTY) continue;
    const { x, y } = coord(i);
    const type = state.board[i] === PIECE.GOAT ? 'goat' : 'tiger';
    // Use <image> element
    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttribute('href', type === 'goat' ? 'goat.png' : 'tiger.png');
    const size = 64; // piece image square size
    img.setAttribute('x', x - size/2);
    img.setAttribute('y', y - size/2);
    img.setAttribute('width', size);
    img.setAttribute('height', size);
    img.setAttribute('class', 'piece-img ' + (state.selected === i ? 'selected' : ''));
    img.addEventListener('click', (e) => { e.stopPropagation(); onPieceClick(i); });
    svg.appendChild(img);
  }
  updateStatus();
}

function showCaptureOverlay() {
  if (!captureOverlay) return;
  captureOverlay.classList.add('active');
  captureOverlay.setAttribute('aria-hidden', 'false');
  // Keep visible briefly; can be adjusted or removed for permanent display
  setTimeout(() => {
    captureOverlay.classList.remove('active');
    captureOverlay.setAttribute('aria-hidden', 'true');
  }, 1400);
}

function updateStatus(message) {
  turnDisplay.textContent = state.winner ? '—' : state.turn;
  goatsToPlaceEl.textContent = state.goatsToPlace;
  goatsCapturedEl.textContent = state.goatsCaptured;
  if (turnDisplayMobile) turnDisplayMobile.textContent = state.winner ? '—' : state.turn;
  if (goatsToPlaceMobile) goatsToPlaceMobile.textContent = state.goatsToPlace;
  if (goatsCapturedMobile) goatsCapturedMobile.textContent = state.goatsCaptured;
  if (message) messageEl.textContent = message;
  else if (state.winner) {
    if (state.winner === 'goat') messageEl.innerHTML = '<span class="win-banner">Goats win: Tigers trapped!</span>';
    else if (state.winner === 'tiger') messageEl.innerHTML = '<span class="lose-banner">Tigers win: Enough goats captured!</span>';
  } else {
    if (currentMode === 'online') {
      if (!onlineRole) messageEl.textContent = 'Waiting for room assignment...';
      else if (onlinePending) messageEl.textContent = 'Sending move...';
      else if (onlineRole && state.turn !== onlineRole) messageEl.textContent = 'Opponent thinking...';
      else messageEl.textContent='';
    } else {
      const side = state.turn;
      const cfg = playerConfig[side];
      if (cfg !== 'human') messageEl.textContent = `${side.charAt(0).toUpperCase()+side.slice(1)} AI (${cfg}) thinking...`;
      else messageEl.textContent = '';
    }
  }
}

function showWinnerOverlay() {
  if (!state.winner || !winnerOverlay) return;
  const isGoat = state.winner === 'goat';
  winnerOverlay.classList.remove('goat-win','tiger-win');
  winnerOverlay.classList.add(isGoat ? 'goat-win' : 'tiger-win');
  winnerTitle.textContent = isGoat ? 'Goats Win!' : 'Tigers Win!';
  // Provide reason text consistent with status messages
  if (isGoat) winnerReason.textContent = 'All tigers are trapped and cannot move.';
  else winnerReason.textContent = 'Tigers have captured enough goats.';
  if (winnerImage) {
    winnerImage.src = isGoat ? 'goat.png' : 'tiger.png';
  }
  winnerOverlay.classList.add('active');
  winnerOverlay.setAttribute('aria-hidden','false');
}

function hideWinnerOverlay() {
  if (!winnerOverlay) return;
  winnerOverlay.classList.remove('active');
  winnerOverlay.setAttribute('aria-hidden','true');
}

function validateOnlineMove(move) {
  // Shallow validation using current local state (may be slightly stale but prevents obvious illegal attempts)
  if (!move) return false;
  if (state.winner) return false;
  if (state.turn !== onlineRole) return false;
  const board = state.board;
  const ADJ = ADJACENCY;
  if (state.turn === 'goat') {
    if (move.type === 'place') {
      if (state.goatsToPlace <= 0) return false;
      if (board[move.to] !== PIECE.EMPTY) return false;
      return true;
    }
    if (move.type === 'move') {
      if (state.isPlacementPhase()) return false;
      if (board[move.from] !== PIECE.GOAT) return false;
      if (board[move.to] !== PIECE.EMPTY) return false;
      if (!ADJ[move.from].includes(move.to)) return false;
      return true;
    }
    return false;
  } else { // tiger
    if (move.type === 'move') {
      if (board[move.from] !== PIECE.TIGER) return false;
      if (board[move.to] !== PIECE.EMPTY) return false;
      if (!ADJ[move.from].includes(move.to)) return false;
      return true;
    }
    if (move.type === 'capture') {
      if (board[move.from] !== PIECE.TIGER) return false;
      if (board[move.over] !== PIECE.GOAT) return false;
      if (board[move.to] !== PIECE.EMPTY) return false;
      if (!ADJ[move.from].includes(move.over)) return false;
      // compute landing
      const fr = Math.floor(move.from/5), fc = move.from%5;
      const or = Math.floor(move.over/5), oc = move.over%5;
      const lr = or + (or - fr), lc = oc + (oc - fc);
      if (lr<0||lr>=5||lc<0||lc>=5) return false;
      const landing = lr*5+lc;
      if (landing !== move.to) return false;
      // adjacency chain check
      if (!ADJ[move.over].includes(landing)) return false;
      return true;
    }
    return false;
  }
}

function sendOnlineMove(move) {
  if (currentMode !== 'online') return false;
  if (!onlineRole) return false;
  if (onlinePending) return false;
  if (!validateOnlineMove(move)) { messageEl.textContent = 'Invalid move'; return false; }
  onlinePending = true;
  mp.sendMove(move);
  updateStatus();
  return true;
}

function applyLocalAndMaybeSend(move) {
  if (currentMode === 'online') {
    // Wait for server to broadcast authoritative state; skip local mutation
    return sendOnlineMove(move);
  }
  const ok = state.applyMove(move);
  if (ok && currentMode === 'online') sendOnlineMove(move); // safety if mode toggled mid-action
  return ok;
}

function onNodeClick(i) {
  if (state.winner) return;
  // If AI turn, ignore clicks
  if (currentMode === 'online' && onlinePending) return; // block while waiting
  if (currentMode === 'online') {
    if (state.turn !== onlineRole) return; // not our turn
  } else if (playerConfig[state.turn] !== 'human') return;
  if (state.turn === 'goat') {
    if (state.isPlacementPhase()) {
      const moveObj = { type:'place', to:i };
      const ok = applyLocalAndMaybeSend(moveObj);
      if (!ok) return;
      if (currentMode !== 'online') {
        render();
        if (state.winner) showWinnerOverlay(); else maybeRunAI();
      } else { state.selected = null; render(); updateStatus(); }
    } else if (state.selected != null && state.board[state.selected] === PIECE.GOAT && state.board[i] === PIECE.EMPTY) {
      const moveObj = { type:'move', from: state.selected, to: i };
      const ok = applyLocalAndMaybeSend(moveObj);
      state.selected = null;
      if (currentMode !== 'online') {
        if (ok) { render(); if (state.winner) { showWinnerOverlay(); } else { maybeRunAI(); } }
        else render();
      } else { render(); updateStatus(); }
    } else {
      state.selected = null; render();
    }
  } else if (state.turn === 'tiger') {
    if (state.selected != null && state.board[state.selected] === PIECE.TIGER) {
      if (state.board[i] === PIECE.EMPTY) {
        // Determine if this empty node is a capture landing by seeing if any adjacent goat between
        const from = state.selected;
        const landing = i;
        let performed = false;
        // Check all neighbors 'over' that are goats where landing is a valid jump
        for (const over of ADJACENCY[from]) {
          if (state.board[over] === PIECE.GOAT) {
            // compute jump landing
            const fr = Math.floor(from/5), fc = from%5;
            const or = Math.floor(over/5), oc = over%5;
            const dr = or - fr, dc = oc - fc;
            const lr = or + dr, lc = oc + dc;
            const calcLanding = (lr>=0 && lr<5 && lc>=0 && lc<5) ? (lr*5+lc) : -1;
            if (calcLanding === landing && state.board[landing] === PIECE.EMPTY) {
              const moveObj = { type:'capture', from, over, to: landing };
              performed = true;
              state.selected = null;
              applyLocalAndMaybeSend(moveObj);
              if (currentMode !== 'online') {
                render();
                if (state.winner) showWinnerOverlay();
                updateStatus('Goat killed');
                showCaptureOverlay();
                maybeRunAI();
              } else { render(); updateStatus('Goat killed'); }
              break;
            }
          }
        }
        if (!performed) {
          // Fallback normal move
            const moveObj = { type:'move', from, to: landing };
              const ok = applyLocalAndMaybeSend(moveObj);
              state.selected = null;
              if (currentMode !== 'online') {
                if (ok) { render(); if (state.winner) { showWinnerOverlay(); } else { maybeRunAI(); } }
                else render();
              } else { render(); updateStatus(); }
        }
      } else if (state.board[i] === PIECE.GOAT) {
        // Selecting a goat adjacent to selected tiger to preview capture (optional: highlight). For now, attempt capture if possible by auto-calculating landing.
        const from = state.selected;
        const over = i;
        const fr = Math.floor(from/5), fc = from%5;
        const or = Math.floor(over/5), oc = over%5;
        const dr = or - fr, dc = oc - fc;
        const lr = or + dr, lc = oc + dc;
        if (lr>=0 && lr<5 && lc>=0 && lc<5) {
          const landing = lr*5+lc;
          if (state.board[landing] === PIECE.EMPTY) {
            const moveObj = { type:'capture', from, over, to: landing };
            state.selected = null;
            applyLocalAndMaybeSend(moveObj);
            if (currentMode !== 'online') {
              render();
              if (state.winner) {
                showWinnerOverlay();
              }
              updateStatus('Goat killed');
              showCaptureOverlay();
              if (!state.winner) maybeRunAI();
            } else { render(); updateStatus('Goat killed'); }
            return;
          }
        }
        // If capture not possible, just change selection to this goat? No, goat not selectable on tiger turn. Clear selection.
        state.selected = null; render();
      } else {
        state.selected = null; render();
      }
    }
  }
}

function onPieceClick(i) {
  if (state.winner) return;
  if (playerConfig[state.turn] !== 'human') return;
  if (state.turn === 'goat') {
    if (state.board[i] === PIECE.GOAT && !state.isPlacementPhase()) {
      state.selected = i; render();
    }
  } else if (state.turn === 'tiger') {
    if (state.board[i] === PIECE.TIGER) {
      // Selecting or performing capture if already selected and clicking goat neighbor? We'll only select here.
      state.selected = i; render();
    }
  }
}

function fullResetLocalState(newState) {
  state.board = newState.board.slice();
  state.goatsToPlace = newState.goatsToPlace;
  state.goatsCaptured = newState.goatsCaptured;
  state.turn = newState.turn;
  state.winner = newState.winner || null;
  state.selected = null;
  onlinePending = false; // server authoritative update arrived
}

function restart() {
  if (currentMode === 'online') {
    mp.restart(); // server will broadcast fresh state
    return;
  }
  state = new GameState();
  state.turn = 'goat';
  render();
  maybeRunAI();
}

restartBtn.addEventListener('click', restart);
modeRadios.forEach(r => r.addEventListener('change', () => {
  currentMode = document.querySelector('input[name="modeSelect"]:checked').value;
  if (currentMode === '2p') {
    singlePlayerOptions.style.display = 'none';
    onlineOptions.style.display = 'none';
    playerConfig = { goat: 'human', tiger: 'human' };
    restart();
  } else if (currentMode === '1p') {
    singlePlayerOptions.style.display = '';
    onlineOptions.style.display = 'none';
    const side = humanSideSelect.value;
    if (side === 'goat') playerConfig = { goat: 'human', tiger: 'unbeatable' };
    else playerConfig = { goat: 'unbeatable', tiger: 'human' };
    restart();
  } else if (currentMode === 'online') {
    singlePlayerOptions.style.display = 'none';
    onlineOptions.style.display = '';
    playerConfig = { goat: 'human', tiger: 'human' }; // local inputs only when our turn
    // Do not auto restart; wait for server state
    updateStatus('Choose create or join.');
  }
  render();
}));

humanSideSelect.addEventListener('change', () => {
  if (currentMode === '1p') {
    const side = humanSideSelect.value;
  if (side === 'goat') playerConfig = { goat: 'human', tiger: 'unbeatable' };
  else playerConfig = { goat: 'unbeatable', tiger: 'human' };
    restart();
  }
});

function maybeRunAI() {
  if (state.winner) return;
  if (currentMode === 'online') return; // no AI online
  const side = state.turn;
  const mode = playerConfig[side];
  if (mode === 'human') return;
  const preset = DIFFICULTY_PRESETS[mode] || DIFFICULTY_PRESETS.hard;
  if (!preset) return;
  // 3 second deliberate delay for AI move
  setTimeout(() => {
    // Build a lightweight state shape for AI
    const aiState = {
      board: state.board.slice(),
      goatsToPlace: state.goatsToPlace,
      goatsCaptured: state.goatsCaptured,
      turn: side
    };
    const move = chooseAIMove(aiState, side, preset);
    if (move) {
      state.applyMove(move);
      if (side === 'tiger' && move.type === 'capture') {
        updateStatus('Goat killed');
        showCaptureOverlay();
      }
      render();
      if (state.winner) {
        showWinnerOverlay();
      } else {
        maybeRunAI();
      }
    }
  }, 3000);
}

// Initialize visibility
if (currentMode === '1p') singlePlayerOptions.style.display = '';
else singlePlayerOptions.style.display = 'none';

// Multiplayer callbacks
mp.on('room', info => {
  onlineRole = info.role;
  onlineStatus.textContent = `Room ${info.roomId} — You are ${onlineRole}`;
  shareLinkWrapper.style.display = 'block';
  const url = location.origin + location.pathname + '#room=' + info.roomId;
  shareLink.textContent = url;
  fullResetLocalState(info.state);
  render();
});
mp.on('state', (s, lastMove, isRestart) => {
  fullResetLocalState(s);
  render();
  if (isRestart) updateStatus('Restarted'); else updateStatus();
});
mp.on('players', players => {
  if (!onlineStatus) return;
  const parts = [];
  parts.push('Room ' + (mp.roomId||''));
  parts.push('Goat:' + (players.goat ? '✓':'✗'));
  parts.push('Tiger:' + (players.tiger ? '✓':'✗'));
  if (onlineRole) parts.push('You:' + onlineRole);
  onlineStatus.textContent = parts.join(' | ');
});
mp.on('error', err => {
  onlinePending = false;
  if (onlineStatus) onlineStatus.textContent = 'Error: ' + err;
  if (messageEl && typeof err === 'string') messageEl.textContent = err;
  updateStatus();
});

function autoJoinFromHash() {
  if (location.hash.startsWith('#room=')) {
    const rid = location.hash.slice(6).toUpperCase();
    currentMode = 'online';
    document.querySelector('input[name="modeSelect"][value="online"]').checked = true;
    singlePlayerOptions.style.display = 'none';
    onlineOptions.style.display = '';
    roomCodeInput.value = rid;
    joinRoom(rid);
  }
}

function preferredRoleValue() {
  const val = onlineSideSelect.value;
  return val === 'any' ? undefined : val;
}

function createRoom() { mp.create(preferredRoleValue()); leaveRoomBtn.style.display=''; }
function joinRoom(code) { mp.join(code, preferredRoleValue()); leaveRoomBtn.style.display=''; }

createRoomBtn?.addEventListener('click', () => { createRoom(); });
joinRoomBtn?.addEventListener('click', () => { const code = roomCodeInput.value.trim().toUpperCase(); if (code) joinRoom(code); });
leaveRoomBtn?.addEventListener('click', () => { mp.leave(); onlineStatus.textContent='Left room'; leaveRoomBtn.style.display='none'; shareLinkWrapper.style.display='none'; onlineRole=null; });

// Initial render
render();
maybeRunAI();
autoJoinFromHash();

if (playAgainBtn) {
  playAgainBtn.addEventListener('click', () => {
    // Just dismiss the overlay; keep final board state visible
    hideWinnerOverlay();
    // Reassert winner message in side banner
    if (state.winner) updateStatus();
  });
}
