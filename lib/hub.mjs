import * as Y from "yjs";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { seed } from "./model.mjs";
const b64 = (u) => Buffer.from(u).toString("base64");
const send = (ws, msg) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};
export function attachHub(http, store) {
  const rooms = new Map(),
    wss = new WebSocketServer({ noServer: true, maxPayload: 768 * 1024 });
  function roomFor(key) {
    if (!rooms.has(key)) {
      const promise = (async () => {
        const doc = new Y.Doc(),
          rows = await store.read(key);
        if (!rows.length) {
          seed(doc);
          await store.append(key, Y.encodeStateAsUpdate(doc));
        } else for (const row of rows) Y.applyUpdate(doc, row);
        return { doc, peers: new Map(), queue: Promise.resolve() };
      })();
      rooms.set(key, promise);
      promise.catch(() => rooms.delete(key));
    }
    return rooms.get(key);
  }
  http.on("upgrade", (req, socket, head) => {
    let path, origin;
    try {
      path = new URL(req.url, "http://localhost").pathname;
      origin = req.headers.origin && new URL(req.headers.origin).host;
    } catch {
      socket.destroy();
      return;
    }
    if (!path.startsWith("/collab/")) return;
    if (
      !/^\/collab\/[a-f0-9]{32}$/.test(path) ||
      (origin && origin !== req.headers.host)
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, path.slice(8)),
    );
  });
  wss.on("connection", (ws, key) => {
    const id = randomUUID(),
      pending = roomFor(key);
    let joined = false;
    ws.on("message", async (raw) => {
      try {
        const m = JSON.parse(raw.toString()),
          r = await pending;
        if (ws.readyState !== WebSocket.OPEN) return;
        if (m.type === "hello") {
          await r.queue;
          r.peers.set(ws, {
            id,
            name: String(m.name || "Guest").slice(0, 28),
            x: null,
            y: null,
          });
          joined = true;
          send(ws, {
            type: "sync",
            data: b64(
              Y.encodeStateAsUpdate(r.doc, Buffer.from(m.vector, "base64")),
            ),
            vector: b64(Y.encodeStateVector(r.doc)),
            id,
          });
          for (const peer of r.peers.keys())
            send(peer, { type: "presence", peers: [...r.peers.values()] });
          return;
        }
        if (!joined) return;
        if (m.type === "update") {
          const bytes = Buffer.from(m.data, "base64");
          const task = r.queue.then(async () => {
            Y.decodeUpdate(bytes);
            await store.append(key, bytes);
            Y.applyUpdate(r.doc, bytes);
            for (const peer of r.peers.keys())
              if (peer !== ws) send(peer, { type: "update", data: m.data });
            send(ws, { type: "ack", token: m.token });
          });
          r.queue = task.catch(() => {});
          await task;
        } else if (m.type === "cursor") {
          const p = r.peers.get(ws);
          if (!p) return;
          p.x = Math.max(0, Math.min(1, Number(m.x) || 0));
          p.y = Math.max(0, Math.min(1, Number(m.y) || 0));
          for (const peer of r.peers.keys())
            if (peer !== ws)
              send(peer, { type: "presence", peers: [...r.peers.values()] });
        }
      } catch {
        ws.close(1011, "Could not sync change");
      }
    });
    ws.on("error", () => {});
    ws.on("close", async () => {
      try {
        const r = await pending;
        r.peers.delete(ws);
        for (const peer of r.peers.keys())
          send(peer, { type: "presence", peers: [...r.peers.values()] });
      } catch {}
    });
  });
  return wss;
}
