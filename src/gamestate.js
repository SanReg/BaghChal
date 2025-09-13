import { PIECE, START_TIGER_POSITIONS, TOTAL_GOATS, GOATS_TO_LOSE } from './constants.js';
import { ADJACENCY, getLandingFromJump } from './board.js';

export class GameState {
  constructor() {
    this.board = Array(25).fill(PIECE.EMPTY);
    for (const t of START_TIGER_POSITIONS) this.board[t] = PIECE.TIGER;
    this.goatsToPlace = TOTAL_GOATS;
    this.goatsCaptured = 0;
    this.turn = 'goat'; // 'goat' | 'tiger'
    this.selected = null; // selected piece index for movement
    this.winner = null; // 'goat' | 'tiger' | 'draw'
  }

  clone() {
    const g = new GameState();
    g.board = this.board.slice();
    g.goatsToPlace = this.goatsToPlace;
    g.goatsCaptured = this.goatsCaptured;
    g.turn = this.turn;
    g.selected = this.selected;
    g.winner = this.winner;
    return g;
  }

  isPlacementPhase() { return this.goatsToPlace > 0; }

  getTigerMoves() {
    const moves = [];
    for (let i = 0; i < 25; i++) {
      if (this.board[i] !== PIECE.TIGER) continue;
      // Normal moves
      for (const n of ADJACENCY[i]) {
        if (this.board[n] === PIECE.EMPTY) moves.push({ type: 'move', from: i, to: n });
      }
      // Captures
      for (const n of ADJACENCY[i]) {
        if (this.board[n] === PIECE.GOAT) {
          const landing = getLandingFromJump(i, n);
            if (landing != null && this.board[landing] === PIECE.EMPTY) {
              moves.push({ type: 'capture', from: i, over: n, to: landing });
            }
        }
      }
    }
    return moves;
  }

  getGoatMoves() {
    const moves = [];
    if (this.isPlacementPhase()) {
      for (let i = 0; i < 25; i++) if (this.board[i] === PIECE.EMPTY) moves.push({ type: 'place', to: i });
      return moves;
    }
    // Movement phase
    for (let i = 0; i < 25; i++) {
      if (this.board[i] !== PIECE.GOAT) continue;
      for (const n of ADJACENCY[i]) if (this.board[n] === PIECE.EMPTY) moves.push({ type: 'move', from: i, to: n });
    }
    return moves;
  }

  applyMove(move) {
    if (this.winner) return false;
    if (this.turn === 'goat') {
      if (move.type === 'place') {
        if (!this.isPlacementPhase() || this.board[move.to] !== PIECE.EMPTY) return false;
        this.board[move.to] = PIECE.GOAT;
        this.goatsToPlace--;
      } else if (move.type === 'move') {
        if (this.isPlacementPhase()) return false;
        if (this.board[move.from] !== PIECE.GOAT || this.board[move.to] !== PIECE.EMPTY) return false;
        this.board[move.from] = PIECE.EMPTY;
        this.board[move.to] = PIECE.GOAT;
      } else return false;
      this.turn = 'tiger';
    } else { // tiger turn
      if (move.type === 'move') {
        // Tiger normal move must be to an adjacent node
        if (this.board[move.from] !== PIECE.TIGER || this.board[move.to] !== PIECE.EMPTY) return false;
        if (!ADJACENCY[move.from].includes(move.to)) return false;
        this.board[move.from] = PIECE.EMPTY;
        this.board[move.to] = PIECE.TIGER;
      } else if (move.type === 'capture') {
        if (this.board[move.from] !== PIECE.TIGER || this.board[move.over] !== PIECE.GOAT || this.board[move.to] !== PIECE.EMPTY) return false;
        // Validate structure of jump: over must be adjacent to from, and landing computed must match move.to
        if (!ADJACENCY[move.from].includes(move.over)) return false;
        const landing = getLandingFromJump(move.from, move.over);
        if (landing == null || landing !== move.to) return false;
        this.board[move.from] = PIECE.EMPTY;
        this.board[move.over] = PIECE.EMPTY;
        this.board[move.to] = PIECE.TIGER;
        this.goatsCaptured++;
      } else return false;
      this.turn = 'goat';
    }
    this.updateWinner();
    return true;
  }

  updateWinner() {
    if (this.goatsCaptured >= GOATS_TO_LOSE) {
      this.winner = 'tiger';
      return;
    }
    // Goat win: all tigers blocked (no tiger moves)
    if (this.getTigerMoves().length === 0) {
      this.winner = 'goat';
      return;
    }
    // Draw detection could be added (repetition, long no-capture), omitted for simplicity.
  }
}
