// Lightweight multiplayer client wrapper
// Provides callbacks: onState(state, lastMove), onPlayers(players), onError(err), onRoom(info)

export class MultiplayerClient {
  constructor() {
    this.ws = null;
    this.roomId = null;
    this.role = null; // 'goat' | 'tiger'
    this.connected = false;
    this.handlers = { state:()=>{}, players:()=>{}, error:()=>{}, room:()=>{} };
  }

  on(event, fn) { this.handlers[event] = fn; }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(proto + '//' + location.host);
    this.ws.addEventListener('open', ()=> { this.connected = true; });
    this.ws.addEventListener('close', ()=> { this.connected = false; });
    this.ws.addEventListener('message', (e) => this._onMessage(e));
  }

  _onMessage(e) {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'created' || msg.type === 'joined') {
      this.roomId = msg.roomId; this.role = msg.role;
      this.handlers.room({ roomId: msg.roomId, role: msg.role, state: msg.state });
      this.handlers.state(msg.state, null);
    } else if (msg.type === 'state') {
      this.handlers.state(msg.state, msg.lastMove||null, msg.restart||false);
    } else if (msg.type === 'players') {
      this.handlers.players(msg.players);
    } else if (msg.type === 'error') {
      this.handlers.error(msg.error);
    }
  }

  create(preferredRole) {
    this.connect();
    this.ws.send(JSON.stringify({ type:'create', preferredRole }));
  }
  join(roomId, preferredRole) {
    this.connect();
    this.ws.send(JSON.stringify({ type:'join', roomId, preferredRole }));
  }
  sendMove(move) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type:'move', move }));
  }
  restart() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type:'restart' }));
  }
  leave() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type:'leave' }));
  }
}
