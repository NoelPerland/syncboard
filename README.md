# SyncBoard

Architecture: a shared board is a Y.Doc with maps for cards, comments and activity. Each client applies local transactions immediately and sends binary Yjs updates over a WebSocket. The server serializes writes per board, persists each update before acknowledging it, and broadcasts to peers. Reconnecting clients exchange state vectors to reconcile offline edits. Cursor presence is transient and never written to the database. A share URL is a bearer capability; this MVP is designed for trusted collaborators.

## Run

Use Node 24, run npm ci and npm run dev, then open http://localhost:3131. The default database is a durable local PostgreSQL engine (PGlite) under .syncboard-data. For standalone PostgreSQL start docker compose up -d, set DATABASE_URL as shown in .env.example in your process environment, and start the app. Production: npm run build then npm start. Deploy this Node server on a host supporting persistent WebSockets, and supply a PostgreSQL URL or a persistent volume. Use HTTPS outside localhost.

## Try together

New board creates a separate workspace; the pencil beside its title renames it for everyone. Share board copies the current board's unique URL. Open it in another browser, change display name using the avatar, drag cards between columns, or open the same card and edit notes simultaneously. The status changes from Saving to Synced after the server commits. Offline changes stay in this tab until reconnection. Use N to add a card, Ctrl/Cmd K to filter and Escape to dismiss. Status select supports keyboard-only moves. Activity records card creation, moves, and comments.

## Verification and scope

After npm run build, run npm run test:browser. Set CHROME_PATH to a Chrome or Chromium executable (defaults to standard Windows Chrome). The browser check starts its own isolated production server and verifies two browser contexts, simultaneous editing, drag/drop, comments, live cursor, activity, keyboard navigation and narrow layouts.

npm test connects independent clients over actual WebSockets, edits one Y.Text concurrently, exchanges cursor positions, reconnects a disconnected editor, then closes and reopens the disk database to confirm saved content. A shared URL grants editing access, including reading activity and comments; choose fictional data in public demos. Display names are labels, not authenticated identities. Single application-server deployment. Multiple replicas need a shared broadcast layer before horizontal scaling.
