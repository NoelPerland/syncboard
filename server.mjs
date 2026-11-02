import http from "node:http";
import next from "next";
import { attachHub } from "./lib/hub.mjs";
import { openStore } from "./lib/store.mjs";
const dev = !process.argv.includes("--production"),
  port = Number(process.env.PORT || 3131);
const app = next({ dev, hostname: "localhost", port });
await app.prepare();
const handler = app.getRequestHandler(),
  upgrade = app.getUpgradeHandler();
const server = http.createServer((req, res) => handler(req, res));
const store = await openStore();
attachHub(server, store);
server.on("upgrade", (req, s, h) => {
  if (!req.url.startsWith("/collab/")) upgrade(req, s, h);
});
server.listen(port, () => console.log("SyncBoard on port " + port));
