// Board geometry and adjacency for 5x5 BaghChal graph.
// Index mapping: row * 5 + col (0..24)

// In BaghChal, all straight orthogonal connections exist plus select diagonals:
// Common authentic pattern: All diagonals inside the board forming an Alquerque pattern (every intersection connected by lines drawn).
// For simplicity and authenticity, we will treat it like the Alquerque board: every position has diagonals unless it is on an edge where diagonal is not drawn.
// We'll explicitly define adjacency list verified manually.

export const ADJACENCY = (() => {
  const adj = Array.from({ length: 25 }, () => new Set());
  const index = (r, c) => r * 5 + c;
  const inBounds = (r, c) => r >= 0 && r < 5 && c >= 0 && c < 5;

  // Orthogonal neighbors
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const i = index(r, c);
      const dirs = [ [1,0], [-1,0], [0,1], [0,-1] ];
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) adj[i].add(index(nr, nc));
      }
    }
  }
  // Diagonal connections: restrict to intersections where (r + c) is even.
  // This produces the classic BaghChal / Alquerque style where only alternating nodes have diagonals.
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if ( (r + c) % 2 !== 0) continue; // only even parity points get diagonals
      const i = index(r, c);
      const diagDirs = [ [1,1], [1,-1], [-1,1], [-1,-1] ];
      for (const [dr, dc] of diagDirs) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) adj[i].add(index(nr, nc));
      }
    }
  }
  // Convert to arrays
  return adj.map(s => Array.from(s));
})();

export function areAligned(a, b, c) {
  // Check if b is between a and c and they lie on a straight allowed edge (orthogonal or diagonal) and all pairs adjacent in path.
  const ar = Math.floor(a / 5), ac = a % 5;
  const br = Math.floor(b / 5), bc = b % 5;
  const cr = Math.floor(c / 5), cc = c % 5;
  const dr1 = br - ar, dc1 = bc - ac;
  const dr2 = cr - br, dc2 = cc - bc;
  // Must be same direction
  if (dr1 === 0 && dc1 === 0) return false;
  if (dr1 !== 0) {
    if (dr2 !== dr1) return false;
  }
  if (dc1 !== 0) {
    if (dc2 !== dc1) return false;
  }
  // Normalize direction to -1,0,1
  const stepR = Math.sign(dr1);
  const stepC = Math.sign(dc1);
  // Allowed directions: orthogonal or diagonal (|stepR|,|stepC|) either (1,0),(0,1),(1,1),(1,-1)
  if (!((Math.abs(stepR) === 1 && stepC === 0) || (Math.abs(stepC) === 1 && stepR === 0) || (Math.abs(stepR) === 1 && Math.abs(stepC) === 1))) return false;
  // Ensure adjacency chaining: a-b and b-c
  if (!ADJACENCY[a].includes(b)) return false;
  if (!ADJACENCY[b].includes(c)) return false;
  return true;
}

export function getLandingFromJump(src, over) {
  const sr = Math.floor(src / 5), sc = src % 5;
  const or = Math.floor(over / 5), oc = over % 5;
  const dr = or - sr, dc = oc - sc;
  const lr = or + dr, lc = oc + dc;
  if (lr < 0 || lr >= 5 || lc < 0 || lc >= 5) return null;
  const landing = lr * 5 + lc;
  // Validate that src-over-landing are consistent with step direction and adjacency chain
  if (!ADJACENCY[src].includes(over)) return null;
  if (!ADJACENCY[over].includes(landing)) return null;
  return landing;
}
