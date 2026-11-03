# SyncBoard — AI continuation brief

## Product and visual identity

SyncBoard is a shared project board for trusted collaborators. People move tasks between lanes, edit the same notes simultaneously, comment, see live cursors and inspect activity. Its value is immediate, persistent collaboration rather than a static Kanban mockup.

Preserve its warm creative-studio identity: paper surfaces, coral/terracotta controls, lavender and sage lanes, expressive typography, generous spacing and tactile tilted notes. The landing preview reads actual Yjs cards; **Move it forward** performs the real persisted move operation. Shared board URLs open directly into the workspace. GSAP motion respects reduced motion. Do not replace it with a generic corporate task dashboard.

## Architecture and entry points

- Next.js, React, TypeScript, CSS and GSAP on the frontend.
- `app/product-intro.tsx`: live landing preview and studio introduction.
- `app/page.tsx`: board interactions, presence, editing and landing/workspace transition.
- `app/style.css`: landing and board visual system.
- `server.mjs`: Node HTTP/WebSocket server. Yjs updates are persisted before acknowledgement, then broadcast. Reconnection exchanges state vectors. Presence is transient.
- Default durable PGlite database in `.syncboard-data`; standalone PostgreSQL is supported with `DATABASE_URL`.
- Important drag fix: disable hover transforms/animations during dragging and keep `.task.dragging` geometry stable. Changing this can break native drop targets.

## Continue on another device

Use Node 24. Clone this repository, check out `handoff/studio-redesign`, run `npm ci`, `npm run build`, then `npm start`. Open http://localhost:3131/. Use `npm run dev` during development.

Source checkout does **not** transfer boards or local database contents. A new machine starts with its own database. Collaboration between machines requires both clients to reach the same running server and database; unrelated localhost instances do not synchronize. Keep database backups and environment values private, outside Git.

## Verification and remaining limits

Before this handoff, production build, browser checks and WebSocket persistence tests passed. Checks covered independent browser contexts, real drag/drop, concurrent Y.Text edits, comments, live cursors, activity, keyboard filtering, narrow layouts, reload, reconnect/offline reconciliation and reopening the disk database. Desktop/mobile screenshots were inspected. Run `npm test` and `npm run test:browser` after functional changes; Chrome/Chromium is required (`CHROME_PATH` override).

A shared board link is a bearer editing capability. Display names are labels, not authenticated identities; this MVP is for trusted collaborators. Keep that disclosure visible. Use fictional information in public demos. Offline edits remain in the tab until reconnection; do not promise durable offline storage after the tab closes.

There is no verified public deployment for this redesign. Hosting must support persistent WebSockets plus PostgreSQL or persistent local disk. Use HTTPS outside localhost. Multiple server replicas need a broadcast layer before horizontal scaling. Do not claim account security, production scaling or a live public app before implementing and testing those capabilities.

No portfolio changes were made. `main` is not the handoff branch.
