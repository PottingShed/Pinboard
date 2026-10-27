// One Durable Object that every open screen connects to over a WebSocket, so
// a new pin or comment shows up everywhere at once. It uses the hibernation
// API: between messages it sleeps and costs nothing, and the keep-alive pings
// are answered without waking it.

import { DurableObject } from 'cloudflare:workers';

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Called by the Worker when something changes.
  broadcast(message) {
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(message); } catch {}
    }
  }

  webSocketMessage() {} // screens only listen

  webSocketClose(ws, code) {
    try { ws.close(code, 'Bye'); } catch {}
  }
}
