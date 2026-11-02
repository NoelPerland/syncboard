import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { attachHub } from "../lib/hub.mjs";
import { openStore } from "../lib/store.mjs";

const enc = (x) => Buffer.from(x).toString("base64"),
  dec = (x) => Buffer.from(x, "base64");
async function until(pred) {
  const end = Date.now() + 8000;
  while (!pred()) {
    if (Date.now() > end) throw Error("Timed out waiting for synchronization");
    await new Promise((r) => setTimeout(r, 15));
  }
}
async function client(port, doc = new Y.Doc()) {
  const ws = new WebSocket(
    "ws://127.0.0.1:" + port + "/collab/" + "1".repeat(32),
  );
  let synced = false,
    acks = 0,
    lastPresence = [];
  function push(u) {
    ws.send(
      JSON.stringify({ type: "update", data: enc(u), token: Date.now() }),
    );
  }
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.type === "sync") {
      Y.applyUpdate(doc, dec(m.data), "server");
      const offline = Y.encodeStateAsUpdate(doc, dec(m.vector));
      if (offline.length > 2) push(offline);
      synced = true;
    } else if (m.type === "update") Y.applyUpdate(doc, dec(m.data), "server");
    else if (m.type === "ack") acks++;
    else if (m.type === "presence") lastPresence = m.peers;
  });
  await once(ws, "open");
  ws.send(
    JSON.stringify({
      type: "hello",
      name: "Test",
      vector: enc(Y.encodeStateVector(doc)),
    }),
  );
  await until(() => synced);
  const transmit = (u, origin) => {
    if (origin !== "server" && ws.readyState === 1) push(u);
  };
  doc.on("update", transmit);
  return {
    doc,
    ws,
    acks: () => acks,
    presence: () => lastPresence,
    close: async () => {
      doc.off("update", transmit);
      const closed = once(ws, "close");
      ws.close();
      await closed;
    },
  };
}
test(
  "two websocket peers converge, recover offline writes, and reload from PostgreSQL storage",
  { timeout: 45000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "syncboard-"));
    let store = await openStore({ url: "", path: dir });
    const server = http.createServer();
    const hub = attachHub(server, store);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = server.address().port;
    try {
      const invalid = new WebSocket(
        "ws://127.0.0.1:" + port + "/collab/" + "1".repeat(32),
        { origin: "not-a-url" },
      );
      await once(invalid, "error");
      const a = await client(port),
        b = await client(port);
      const key = [...a.doc.getMap("cards").keys()][0];
      const notes = (d) => d.getMap("cards").get(key).get("notes");
      notes(a.doc).insert(0, "Alpha");
      notes(b.doc).insert(0, "Beta");
      await until(
        () =>
          a.acks() > 0 &&
          b.acks() > 0 &&
          notes(a.doc).toString() === notes(b.doc).toString(),
      );
      assert.match(notes(a.doc).toString(), /Alpha/);
      assert.match(notes(a.doc).toString(), /Beta/);
      b.ws.send(JSON.stringify({ type: "cursor", x: 0.33, y: 0.44 }));
      await until(() => a.presence().some((p) => p.x === 0.33));
      await b.close();
      notes(b.doc).insert(0, "Offline ");
      notes(a.doc).insert(0, "Online ");
      await until(() => a.acks() >= 2);
      const c = await client(port, b.doc);
      await until(
        () =>
          notes(a.doc).toString() === notes(c.doc).toString() && c.acks() > 0,
      );
      const expected = notes(c.doc).toString();
      assert.match(expected, /Offline/);
      assert.match(expected, /Online/);
      await a.close();
      await c.close();
      await store.close();
      store = await openStore({ url: "", path: dir });
      const loaded = new Y.Doc();
      for (const u of await store.read("1".repeat(32)))
        Y.applyUpdate(loaded, u);
      assert.equal(notes(loaded).toString(), expected);
    } finally {
      for (const ws of hub.clients) ws.terminate();
      hub.close();
      await new Promise((r) => server.close(r));
      await store.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
