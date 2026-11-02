"use client";
import * as Y from "yjs";
import { useEffect, useRef, useState } from "react";
import { addCard, lanes, log, replaceText } from "../lib/model.mjs";

type Peer = { id: string; name: string; x: number | null; y: number | null };
type Entry = { actor: string; action: string; title: string; at: number };
type Comment = { name: string; body: string; at: number };
type Card = Y.Map<any>;
const encode = (bytes: Uint8Array) => {
  let s = "";
  for (const n of bytes) s += String.fromCharCode(n);
  return btoa(s);
};
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const time = (n: number) =>
  new Date(n).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const colors = ["#9be0c5", "#e9b892", "#aaa6ef", "#9ecde5"];
function color(id: string) {
  return colors[(id.charCodeAt(0) || 0) % colors.length];
}
export default function Board() {
  const [doc] = useState(() => new Y.Doc()),
    [, render] = useState(0),
    [status, setStatus] = useState("Connecting"),
    [peers, setPeers] = useState<Peer[]>([]),
    [me, setMe] = useState(""),
    [identity, setIdentity] = useState(""),
    [editName, setEditName] = useState(false),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [panel, setPanel] = useState(false),
    [comment, setComment] = useState(""),
    [adding, setAdding] = useState(""),
    [draft, setDraft] = useState(""),
    [drag, setDrag] = useState(""),
    [over, setOver] = useState(""),
    [notice, setNotice] = useState(""),
    [ready, setReady] = useState(false),
    [renaming, setRenaming] = useState(false),
    [boardTitle, setBoardTitle] = useState("");
  const socket = useRef<WebSocket | null>(null),
    surface = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    name = useRef(""),
    lastCursor = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    const url = new URL(location.href),
      provided = url.searchParams.get("board");
    if (provided && !/^[a-f0-9]{32}$/.test(provided)) {
      setStatus("Invalid board link");
      return;
    }
    let previous = "",
      savedName = "";
    try {
      previous = localStorage.getItem("syncboard.board") || "";
      savedName = localStorage.getItem("syncboard.name") || "";
    } catch {}
    const key =
      provided ||
      (/^[a-f0-9]{32}$/.test(previous)
        ? previous
        : crypto.randomUUID().replaceAll("-", ""));
    url.searchParams.set("board", key);
    history.replaceState(null, "", url);
    name.current = savedName || "Maker " + crypto.randomUUID().slice(0, 4);
    setIdentity(name.current);
    try {
      localStorage.setItem("syncboard.board", key);
    } catch {}
    let stopped = false,
      retry: ReturnType<typeof setTimeout>,
      latest = 0;
    function push(bytes: Uint8Array) {
      pending.current = true;
      setStatus("Saving");
      if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(
          JSON.stringify({
            type: "update",
            data: encode(bytes),
            token: ++latest,
          }),
        );
      else setStatus("Offline · edits queued");
    }
    function changed(bytes: Uint8Array, origin: unknown) {
      render((i) => i + 1);
      if (origin !== "remote") push(bytes);
    }
    doc.on("update", changed);
    function connect() {
      if (stopped) return;
      const ws = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/collab/" +
          key,
      );
      socket.current = ws;
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            type: "hello",
            name: name.current,
            vector: encode(Y.encodeStateVector(doc)),
          }),
        );
      ws.onmessage = (e) => {
        if (stopped) return;
        const m = JSON.parse(e.data);
        if (m.type === "sync") {
          Y.applyUpdate(doc, decode(m.data), "remote");
          setMe(m.id);
          setReady(true);
          const delta = Y.encodeStateAsUpdate(doc, decode(m.vector));
          if (delta.length > 2) push(delta);
          else {
            pending.current = false;
            setStatus("Synced");
          }
        } else if (m.type === "update") {
          Y.applyUpdate(doc, decode(m.data), "remote");
        } else if (m.type === "presence") setPeers(m.peers);
        else if (m.type === "ack" && m.token === latest) {
          pending.current = false;
          setStatus("Synced");
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setPeers([]);
        setStatus(pending.current ? "Offline · edits queued" : "Reconnecting");
        retry = setTimeout(connect, 1000);
      };
    }
    connect();
    const guard = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      stopped = true;
      clearTimeout(retry);
      doc.off("update", changed);
      socket.current?.close();
      window.removeEventListener("beforeunload", guard);
    };
  }, [doc]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const input = (e.target as HTMLElement)?.matches("input,textarea,select");
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "Escape") {
        setSelected("");
        setAdding("");
        setPanel(false);
        setEditName(false);
        setRenaming(false);
        search.current?.blur();
      } else if (!input && e.key === "n" && ready) {
        e.preventDefault();
        setAdding(lanes[0]);
        setDraft("");
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [ready]);
  const cards = [...doc.getMap<Card>("cards").entries()].sort(
    (a, b) => a[1].get("rank") - b[1].get("rank") || a[0].localeCompare(b[0]),
  );
  const card = doc.getMap<Card>("cards").get(selected),
    events = [...doc.getMap<Entry>("events").values()].sort(
      (a, b) => b.at - a.at,
    );
  function move(id: string, lane: string, before?: string) {
    const c = doc.getMap<Card>("cards").get(id);
    if (!c || before === id) return;
    const list = cards.filter(([k, v]) => k !== id && v.get("lane") === lane);
    const i = before ? list.findIndex(([k]) => k === before) : -1;
    const rank =
      i < 0
        ? (list.at(-1)?.[1].get("rank") || 0) + 1024
        : i === 0
          ? list[0][1].get("rank") - 1024
          : (list[i - 1][1].get("rank") + list[i][1].get("rank")) / 2;
    doc.transact(() => {
      c.set("lane", lane);
      c.set("rank", rank);
      log(doc, name.current, "moved to " + lane, c.get("title").toString());
    });
    setDrag("");
    setOver("");
  }
  function submitCard(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    addCard(doc, draft.trim(), adding, name.current);
    setDraft("");
    setAdding("");
  }
  function updateName(e: React.FormEvent) {
    e.preventDefault();
    if (!identity.trim()) return;
    name.current = identity.trim().slice(0, 28);
    try {
      localStorage.setItem("syncboard.name", name.current);
    } catch {}
    setEditName(false);
    socket.current?.close();
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setNotice("Board link copied. Anyone with it can edit.");
    } catch {
      setNotice(location.href);
    }
  }
  return (
    <main>
      <header>
        <a className="brand" href="./">
          <i>∥</i> SyncBoard
        </a>
        <span className="divider">/</span>
        <span className="subtle">Shared workspace</span>
        <div className="spacer" />
        <span className="status">
          <b />
          {status}
        </span>
        <button
          onClick={() => setEditName(!editName)}
          aria-label="Change display name"
          className="avatar"
        >
          {identity.slice(0, 1) || "·"}
        </button>
      </header>
      {editName && (
        <form className="identity" onSubmit={updateName}>
          <label>
            Your display name
            <input
              autoFocus
              value={identity}
              maxLength={28}
              onChange={(e) => setIdentity(e.target.value)}
            />
          </label>
          <button>Save</button>
        </form>
      )}
      <section className="intro">
        <div>
          <small>STUDIO / PROJECTS</small>
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!boardTitle.trim()) return;
                doc.transact(() => {
                  doc.getMap("meta").set("title", boardTitle.trim());
                  log(doc, name.current, "renamed board", boardTitle.trim());
                });
                setRenaming(false);
              }}
            >
              <label>
                Board name
                <input
                  autoFocus
                  value={boardTitle}
                  maxLength={70}
                  onChange={(e) => setBoardTitle(e.target.value)}
                />
              </label>
              <button>Save name</button>
            </form>
          ) : (
            <h1>
              {String(doc.getMap("meta").get("title") || "Product studio")}
              <span>.</span>
              <button
                className="rename"
                aria-label="Rename board"
                disabled={!ready}
                onClick={() => {
                  setBoardTitle(String(doc.getMap("meta").get("title") || ""));
                  setRenaming(true);
                }}
              >
                ✎
              </button>
            </h1>
          )}
          <p>A shared board for work in motion.</p>
        </div>
        <div className="actions">
          <div className="people">
            {peers.slice(0, 4).map((p) => (
              <span
                key={p.id}
                title={p.name}
                style={{ background: color(p.id) }}
              >
                {p.name[0]}
              </span>
            ))}
          </div>
          <button
            onClick={() => {
              const url = new URL(location.href);
              url.searchParams.set(
                "board",
                crypto.randomUUID().replaceAll("-", ""),
              );
              location.assign(url.toString());
            }}
          >
            New board
          </button>
          <button className="primary" onClick={share}>
            Share board ↗
          </button>
        </div>
      </section>
      <nav>
        <button
          className={!panel ? "tab active" : "tab"}
          onClick={() => setPanel(false)}
        >
          ▦　Board
        </button>
        <button
          className={panel ? "tab active" : "tab"}
          onClick={() => setPanel(true)}
        >
          ◷　Activity
        </button>
        <div className="spacer" />
        <input
          ref={search}
          aria-label="Filter cards"
          placeholder="Filter cards　⌘ K"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </nav>
      {notice && (
        <div role="status" className="notice">
          {notice}
          <button onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}
      <div
        className="surface"
        ref={surface}
        onPointerMove={(e) => {
          if (
            Date.now() - lastCursor.current < 75 ||
            socket.current?.readyState !== WebSocket.OPEN
          )
            return;
          lastCursor.current = Date.now();
          const r = e.currentTarget.getBoundingClientRect();
          socket.current.send(
            JSON.stringify({
              type: "cursor",
              x: (e.clientX - r.left) / r.width,
              y: (e.clientY - r.top) / r.height,
            }),
          );
        }}
      >
        {!ready ? (
          <p className="empty">
            {status === "Invalid board link" ? status : "Opening workspace…"}
          </p>
        ) : panel ? (
          <section className="activity">
            <h2>Activity history</h2>
            {events.map((a, i) => (
              <div key={i}>
                <time>{time(a.at)}</time>
                <p>
                  <strong>{a.actor}</strong> {a.action} <em>{a.title}</em>
                </p>
              </div>
            ))}
          </section>
        ) : (
          <div className="lanes">
            {lanes.map((lane, index) => {
              const visible = cards.filter(
                ([, c]) =>
                  c.get("lane") === lane &&
                  c
                    .get("title")
                    .toString()
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              );
              return (
                <section
                  key={lane}
                  className={"lane " + (drag && over === lane ? "target" : "")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(lane);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    move(e.dataTransfer.getData("text/plain"), lane);
                  }}
                >
                  <h2>
                    <i style={{ background: colors[index] }} />
                    {lane}
                    <span>{visible.length}</span>
                    <button
                      title={"Add to " + lane}
                      aria-label={"Add to " + lane}
                      onClick={() => {
                        setAdding(lane);
                        setDraft("");
                      }}
                    >
                      +
                    </button>
                  </h2>
                  {visible.map(([id, c]) => (
                    <button
                      className={"task " + (drag === id ? "dragging" : "")}
                      key={id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", id);
                        setDrag(id);
                      }}
                      onDragEnd={() => {
                        setDrag("");
                        setOver("");
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        move(e.dataTransfer.getData("text/plain"), lane, id);
                      }}
                      onClick={() => {
                        setSelected(id);
                        setComment("");
                      }}
                    >
                      <small>SB–{id.slice(0, 4).toUpperCase()}</small>
                      <strong>{c.get("title").toString() || "Untitled"}</strong>
                      <span>
                        {c.get("author")}　·　{c.get("comments").size} comments
                      </span>
                    </button>
                  ))}
                  {adding === lane ? (
                    <form onSubmit={submitCard}>
                      <input
                        aria-label="New card title"
                        autoFocus
                        maxLength={160}
                        placeholder="Card title"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <button className="primary">Add card</button>
                    </form>
                  ) : (
                    <button
                      className="add"
                      onClick={() => {
                        setAdding(lane);
                        setDraft("");
                      }}
                    >
                      ＋ Add card
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}
        {peers
          .filter((p) => p.id !== me && p.x !== null && p.y !== null)
          .map((p) => (
            <span
              className="cursor"
              key={p.id}
              style={{
                left: p.x! * 100 + "%",
                top: p.y! * 100 + "%",
                color: color(p.id),
              }}
            >
              ◤ <b>{p.name}</b>
            </span>
          ))}
      </div>
      {card && (
        <div className="backdrop" onClick={() => setSelected("")}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Card details"
            className="drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row">
              <small>SB–{selected.slice(0, 4).toUpperCase()}</small>
              <button autoFocus onClick={() => setSelected("")}>
                Close ×
              </button>
            </div>
            <label>
              Title
              <input
                maxLength={160}
                value={card.get("title").toString()}
                onChange={(e) => replaceText(card.get("title"), e.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={card.get("lane")}
                onChange={(e) => move(selected, e.target.value)}
              >
                {lanes.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Shared notes
              <textarea
                placeholder="Write together…"
                value={card.get("notes").toString()}
                onChange={(e) => replaceText(card.get("notes"), e.target.value)}
              />
            </label>
            <h3>Comments</h3>
            {Array.from((card.get("comments") as Y.Map<Comment>).values())
              .sort((a, b) => a.at - b.at)
              .map((v, i) => (
                <article key={i}>
                  <strong>{v.name}</strong>
                  <time>{time(v.at)}</time>
                  <p>{v.body}</p>
                </article>
              ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                doc.transact(() => {
                  card
                    .get("comments")
                    .set(crypto.randomUUID(), {
                      name: name.current,
                      body: comment.trim(),
                      at: Date.now(),
                    });
                  log(
                    doc,
                    name.current,
                    "commented on",
                    card.get("title").toString(),
                  );
                });
                setComment("");
              }}
            >
              <label>
                Add comment
                <input
                  maxLength={1000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <button className="primary" disabled={!comment.trim()}>
                Post comment
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
