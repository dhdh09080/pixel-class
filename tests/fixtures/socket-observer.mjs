// Test-only observer, injected with Node --import by scripts/soak.mjs.
// No endpoint, account/session identifier or production debug interface is added.
import { WebSocketServer } from 'ws';
let active = 0,
  opened = 0,
  closed = 0,
  peak = 0;
const original = WebSocketServer.prototype.handleUpgrade;
WebSocketServer.prototype.handleUpgrade = function (request, socket, head, callback) {
  return original.call(this, request, socket, head, (ws, req) => {
    active++;
    opened++;
    peak = Math.max(peak, active);
    const send = () => {
      if (process.connected)
        process.send({ type: 'qa-socket-count', active, opened, closed, peak });
    };
    send();
    ws.once('close', () => {
      active--;
      closed++;
      send();
    });
    callback(ws, req);
  });
};
