import { PIECE, GOATS_TO_LOSE } from './constants.js';
import { ADJACENCY, getLandingFromJump } from './board.js';

// Expanded presets: 'unbeatable' uses iterative deepening & advanced search
export const DIFFICULTY_PRESETS = {
  easy: { depthTiger: 1, depthGoat: 1, noise: 0.35 },
  medium: { depthTiger: 2, depthGoat: 2, noise: 0.12 },
  hard: { depthTiger: 4, depthGoat: 4, noise: 0 },
  unbeatable: { timeMs: 3000, maxDepth: 12 } // deeper adaptive search
};

// ----------------- Move Generation -----------------
function tigerMoves(state) {
  const moves = [];
  for (let i = 0; i < 25; i++) if (state.board[i] === PIECE.TIGER) {
    let anyCapture = false;
    for (const n of ADJACENCY[i]) {
      if (state.board[n] === PIECE.GOAT) {
        const landing = getLandingFromJump(i, n);
        if (landing != null && state.board[landing] === PIECE.EMPTY) { moves.push({ type:'capture', from:i, over:n, to:landing }); anyCapture = true; }
      }
    }
    if (!anyCapture) { // only include quiet moves if no capture from this tiger (capture preference ordering later)
      for (const n of ADJACENCY[i]) if (state.board[n] === PIECE.EMPTY) moves.push({ type:'move', from:i, to:n });
    }
  }
  return moves;
}

function tigerAllMoves(state) { // used in evaluation (mobility) and terminal detection
  const moves = [];
  for (let i = 0; i < 25; i++) if (state.board[i] === PIECE.TIGER) {
    for (const n of ADJACENCY[i]) {
      if (state.board[n] === PIECE.EMPTY) moves.push({ type:'move', from:i, to:n });
      else if (state.board[n] === PIECE.GOAT) {
        const landing = getLandingFromJump(i, n);
        if (landing != null && state.board[landing] === PIECE.EMPTY) moves.push({ type:'capture', from:i, over:n, to:landing });
      }
    }
  }
  return moves;
}

function goatMoves(state) {
  const moves = [];
  if (state.goatsToPlace > 0) {
    for (let i = 0; i < 25; i++) if (state.board[i] === PIECE.EMPTY) moves.push({ type:'place', to:i });
    return moves;
  }
  for (let i = 0; i < 25; i++) if (state.board[i] === PIECE.GOAT) {
    for (const n of ADJACENCY[i]) if (state.board[n] === PIECE.EMPTY) moves.push({ type:'move', from:i, to:n });
  }
  return moves;
}

function apply(state, move) {
  if (state.turn === 'goat') {
    if (move.type === 'place') { state.board[move.to] = PIECE.GOAT; state.goatsToPlace--; }
    else { state.board[move.to] = PIECE.GOAT; state.board[move.from] = PIECE.EMPTY; }
    state.turn = 'tiger';
  } else {
    if (move.type === 'move') { state.board[move.to] = PIECE.TIGER; state.board[move.from] = PIECE.EMPTY; }
    else { state.board[move.to] = PIECE.TIGER; state.board[move.from] = PIECE.EMPTY; state.board[move.over] = PIECE.EMPTY; state.goatsCaptured++; }
    state.turn = 'goat';
  }
}

function cloneState(s) {
  return { board: s.board.slice(), goatsToPlace: s.goatsToPlace, goatsCaptured: s.goatsCaptured, turn: s.turn };
}

// ----------------- Evaluation -----------------
// Negamax perspective: score is always from goats' point of view (>0 good for goats)
function evaluate(state) {
  // Terminal checks
  if (state.goatsCaptured >= GOATS_TO_LOSE) return -100000; // tiger win => terrible for goats
  const allTigerMoves = tigerAllMoves(state);
  if (allTigerMoves.length === 0) return 100000; // goats trapped all tigers

  let goatCount = 0, tigerPositions = [];
  for (let i=0;i<25;i++) if (state.board[i] === PIECE.GOAT) goatCount++; else if (state.board[i] === PIECE.TIGER) tigerPositions.push(i);

  // Phase: placement vs movement dominance
  const placementPhase = state.goatsToPlace > 0;

  let goatMob = 0, tigerMob = 0, vulnerableGoats = 0, semiTrappedTigers = 0;
  let goatCentral = 0, tigerCentral = 0, goatClusterPenalty = 0;
  const centerDist = idx => { const r=Math.floor(idx/5), c=idx%5; return Math.abs(r-2)+Math.abs(c-2); };

  // Precompute goat adjacency counts for clustering detection
  const goatNeighbors = new Array(25).fill(0);
  for (let i=0;i<25;i++) if (state.board[i] === PIECE.GOAT) {
    for (const n of ADJACENCY[i]) if (state.board[n] === PIECE.GOAT) goatNeighbors[i]++;
  }

  for (let i=0;i<25;i++) {
    const piece = state.board[i];
    if (piece === PIECE.GOAT) {
      goatCentral += (4 - centerDist(i));
      if (goatNeighbors[i] >= 3) goatClusterPenalty += (goatNeighbors[i]-2); // avoid over-clumping
      for (const n of ADJACENCY[i]) if (state.board[n] === PIECE.EMPTY) goatMob++;
    } else if (piece === PIECE.TIGER) {
      tigerCentral += (4 - centerDist(i));
      let localMob = 0; let captureExists = false;
      for (const n of ADJACENCY[i]) {
        if (state.board[n] === PIECE.EMPTY) { tigerMob++; localMob++; }
        else if (state.board[n] === PIECE.GOAT) {
          const landing = getLandingFromJump(i,n);
            if (landing != null && state.board[landing] === PIECE.EMPTY) { vulnerableGoats++; captureExists = true; }
        }
      }
      if (!captureExists && localMob <= 1) semiTrappedTigers++; // near trapped pressure
    }
  }

  const goatsRemainingToPlace = state.goatsToPlace;
  // Weighted heuristic components
  let score = 0;
  // Piece & capture balance
  score += goatCount * 6; // living goats value
  score -= state.goatsCaptured * 95; // lost goats severe
  // Mobility dynamics
  score += goatMob * 5.5;
  score -= tigerMob * 3.8;
  // Tactical threats
  score -= vulnerableGoats * 20;
  score += semiTrappedTigers * 22; // progress toward trapping
  // Centralization (mild)
  score += goatCentral * 0.9;
  score -= tigerCentral * 0.6;
  // Placement phase pressure: encourage rapid, safe spread
  if (placementPhase) {
    score -= goatsRemainingToPlace * 4.5;
    score -= goatClusterPenalty * 2.2;
  } else {
    score -= goatClusterPenalty * 1.2;
  }

  return score;
}

// ----------------- Negamax with Alpha-Beta & Transposition -----------------
const TT = new Map(); // key -> { depth, value, flag, bestMove }
const killerMoves = {}; // depth -> [m1,m2]
const historyTable = new Map(); // move signature -> score

function key(state) { return state.board.join('') + '|' + state.goatsToPlace + '|' + state.goatsCaptured + '|' + state.turn; }

function moveSignature(m) { return m.type+'-'+(m.from??'')+'-'+(m.over??'')+'-'+(m.to??''); }

function orderMoves(moves, state, sideIsGoat, depth) {
  const centerDist = idx => { const r=Math.floor(idx/5), c=idx%5; return Math.abs(r-2)+Math.abs(c-2); };
  const killers = killerMoves[depth] || [];
  return moves.map(m => {
    let score = 0;
    if (m.type === 'capture') score += 5000;
    if (killers.some(k => k && moveSignature(k) === moveSignature(m))) score += 3000;
    const hist = historyTable.get(moveSignature(m)) || 0; score += hist;
    if (m.to != null) score += (20 - centerDist(m.to));
    return { m, score };
  }).sort((a,b)=> b.score - a.score).map(o=>o.m);
}

// Quiescence: extend on potential tactical tiger captures to avoid horizon issues
function quiescence(state, alpha, beta, sideIsGoat, startTime, timeLimitMs) {
  if (performance.now() - startTime > timeLimitMs) return alpha; // timeout returns bound
  const standPat = evaluate(state);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;
  // Only extend on tiger capture sequences (goat cannot capture)
  if (sideIsGoat) return alpha; // goats to move -> no capture sequences to consider
  const captureMoves = tigerMoves(state).filter(m => m.type === 'capture');
  if (!captureMoves.length) return alpha;
  for (const m of captureMoves) {
    const next = cloneState(state); apply(next, m);
    const score = -quiescence(next, -beta, -alpha, !sideIsGoat, startTime, timeLimitMs);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(state, depth, alpha, beta, sideIsGoat, startTime, timeLimitMs) {
  if (performance.now() - startTime > timeLimitMs) return { timedOut:true, value:0 };
  const k = key(state);
  const tt = TT.get(k);
  if (tt && tt.depth >= depth) {
    if (tt.flag === 'EXACT') return { value: tt.value };
    if (tt.flag === 'LOWER' && tt.value > alpha) alpha = tt.value;
    else if (tt.flag === 'UPPER' && tt.value < beta) beta = tt.value;
    if (alpha >= beta) return { value: tt.value };
  }

  // Terminal or depth 0
  const termWinTiger = state.goatsCaptured >= GOATS_TO_LOSE;
  if (termWinTiger) return { value: -100000 + (10-depth) };
  const tigerM = tigerAllMoves(state);
  if (tigerM.length === 0) return { value: 100000 - (10-depth) };
  if (depth === 0) {
    const qv = quiescence(state, -Infinity, Infinity, sideIsGoat, startTime, timeLimitMs);
    return { value: qv };
  }

  let moves = sideIsGoat ? goatMoves(state) : tigerMoves(state);
  if (moves.length === 0) return { value: evaluate(state) };
  moves = orderMoves(moves, state, sideIsGoat, depth);

  let bestVal = -Infinity;
  let bestMove = null;
  let origAlpha = alpha;
  for (const m of moves) {
    const next = cloneState(state); apply(next, m);
    const { timedOut, value } = negamax(next, depth - 1, -beta, -alpha, !sideIsGoat, startTime, timeLimitMs);
    if (timedOut) return { timedOut:true };
    const sc = -value;
    if (sc > bestVal) { bestVal = sc; bestMove = m; }
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break; // beta cut
      // Record killer move (non capture to be most useful) and history
      if (m.type !== 'capture') {
        killerMoves[depth] = killerMoves[depth] || [];
        const arr = killerMoves[depth];
        if (!arr[0] || moveSignature(arr[0]) !== moveSignature(m)) {
          arr[1] = arr[0];
          arr[0] = m;
        }
      }
      const sig = moveSignature(m);
      historyTable.set(sig, (historyTable.get(sig)||0) + depth*depth);
  }
  // Store TT
  let flag = 'EXACT';
  if (bestVal <= origAlpha) flag = 'UPPER';
  else if (bestVal >= beta) flag = 'LOWER';
  TT.set(k, { depth, value: bestVal, flag, bestMove });
  return { value: bestVal, move: bestMove };
}

function iterativeDeepening(root, sideIsGoat, timeMs, maxDepth) {
  const start = performance.now();
  let bestMove = null;
  for (let d = 1; d <= maxDepth; d++) {
    const res = negamax(root, d, -Infinity, Infinity, sideIsGoat, start, timeMs);
    if (res.timedOut) break;
    if (res.move) bestMove = res.move;
    // Early finish if decisive
    if (res.value >= 90000 || res.value <= -90000) break;
    if (performance.now() - start > timeMs) break;
  }
  return bestMove;
}

export function chooseAIMove(rootState, side, preset) {
  const isGoat = side === 'goat';
  // Unbeatable mode triggers iterative deepening
  if (preset && preset.timeMs) {
    const root = cloneState(rootState);
    return iterativeDeepening(root, isGoat, preset.timeMs, preset.maxDepth || 10);
  }
  // Fallback legacy fixed-depth for other presets
  const depth = isGoat ? preset.depthGoat : preset.depthTiger;
  const noise = preset.noise || 0;
  const moves = isGoat ? goatMoves(rootState) : tigerMoves(rootState);
  if (moves.length === 0) return null;
  if (Math.random() < noise) return moves[Math.floor(Math.random()*moves.length)];
  let bestVal = -Infinity; let best = [];
  for (const m of moves) {
    const next = cloneState(rootState); apply(next, m);
    const { value } = negamax(next, depth-1, -Infinity, Infinity, !isGoat, performance.now(), 1e9);
    const sc = -value;
    if (sc > bestVal) { bestVal = sc; best = [m]; }
    else if (sc === bestVal) best.push(m);
  }
  return best[Math.floor(Math.random()*best.length)];
}

// Development helper: run AI vs AI (unbeatable or given preset) for a number of plies
export function selfPlay(preset = DIFFICULTY_PRESETS.unbeatable, maxPlies = 200) {
  const s = cloneState({ board: rootStartBoard(), goatsToPlace: 20, goatsCaptured: 0, turn: 'goat' });
  function rootStartBoard() {
    // Start position: 4 tigers pre-placed at official corners (0,4,20,24) else empty
    const b = new Array(25).fill(PIECE.EMPTY);
    b[0] = b[4] = b[20] = b[24] = PIECE.TIGER;
    return b;
  }
  const history = [];
  for (let ply=0; ply<maxPlies; ply++) {
    const move = chooseAIMove(s, s.turn, preset);
    if (!move) break;
    apply(s, move);
    history.push({ ply, turn: s.turn === 'goat' ? 'tiger' : 'goat', move });
    // Terminal checks
    if (s.goatsCaptured >= GOATS_TO_LOSE) break;
    if (tigerAllMoves(s).length === 0) break;
  }
  return { state: s, history };
}
