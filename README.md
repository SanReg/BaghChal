# BaghChal (Tigers and Goats)

A browser-based implementation of the traditional Nepali asymmetric strategy game **BaghChal** using only HTML, CSS, and JavaScript (no build tools required).

## Modes
| Mode | Description |
|------|-------------|
| 1 Player | Play as Goats or Tigers against a strong AI (iterative deepening for "Unbeatable"). |
| Local 2 Players | Two humans taking turns on the same device. |
| Online | Create or join a room and play over the network (WebSocket relay server). |

## How to Run (Offline / Local)
Just open `index.html` in any modern browser (Chrome, Edge, Firefox). No server needed for 1P or Local 2P.

On Windows (PowerShell):
```powershell
Start-Process .\index.html
```
Or double-click the file in Explorer.

## Rules (Summary)
- Board: 5x5 grid with diagonal connections (Alquerque-style pattern).
- Sides: 4 Tigers vs 20 Goats.
- Setup: Tigers start in four corners. Goats enter the board gradually during placement phase.
- Turn Order: Goats first.
- Goat Placement Phase: Each goat turn places one goat on any empty point until all 20 are placed.
- Movement Phase: After placement, goats move one step to an adjacent connected intersection (no captures).
- Tigers: From the start may move one step or capture by jumping over an adjacent goat to an empty landing space directly beyond along a valid line.
- Capture Limit: One goat per tiger move (no chaining) in this implementation.
- Victory:
  - Tigers win when they have captured at least 5 goats.
  - Goats win if all tigers are blocked (no legal tiger moves or captures).

## Current Features
- Interactive SVG board.
- Strong multi-depth AI (with iterative deepening "unbeatable" mode).
- Local 1P & 2P.
- Online multiplayer via room codes (WebSocket server).
- Animated capture overlay & winner dialog.

## Planned Improvements
- Spectators / observers.
- Move history & optional undo (with both players' consent online).
- Draw detection (repetition / inactivity heuristic).
- Mobile gesture refinements & accessibility enhancements.

## Online Multiplayer

### Prerequisites
Node.js 18+ (or any recent version supporting ES modules).

### Install & Start Server
From the project root:

```powershell
npm install
npm start
```

This launches an Express static server and a WebSocket server (default port 3000). Browse to:

```
http://localhost:3000
```

### Creating a Room
1. Select "Online" mode.
2. Choose a preferred side (Goats / Tigers / Any).
3. Click "Create". A room code (e.g. `AB12CD`) is generated and a share link appears.
4. Send the code or full link (`http://localhost:3000#room=AB12CD`) to your friend.

### Joining a Room
1. Select Online mode.
2. Enter the room code and press "Join" OR open a direct link with `#room=CODE` (auto-joins).
3. You are assigned a role (preferred if available, otherwise the remaining side).

### Gameplay Sync
All moves are validated and relayed by the server. Restart requests trigger a full fresh state broadcast.

### Leaving
Click "Leave" (visible after connecting). If both players leave the room is deleted server-side.

### Server Validation
The server enforces:
- Correct turn order.
- Legal placements / moves / captures (adjacency & landing spot rules).
- Win conditions (5 goats captured OR all tigers immobile).

No AI runs in Online mode—it's strictly PvP.

## Project Structure
```
index.html
styles.css
package.json
server.js
src/
  constants.js
  board.js
  gamestate.js
  ai.js
  multiplayer.js
  main.js
```

## Modifying the Game
- Adjust win capture threshold in `src/constants.js` (`GOATS_TO_LOSE`).
- Tweak adjacency rules or diagonal logic in `src/board.js` if you prefer a stricter traditional subset.

## License
MIT
