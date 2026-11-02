import * as Y from "yjs";
export const lanes = ["Inbox", "In progress", "Review", "Done"];
export function addCard(
  doc,
  title,
  lane = "Inbox",
  actor = "Studio",
  id = crypto.randomUUID(),
) {
  const card = new Y.Map();
  doc.transact(() => {
    doc.getMap("cards").set(id, card);
    card.set("title", new Y.Text(title));
    card.set("notes", new Y.Text());
    card.set("lane", lane);
    card.set("rank", Date.now());
    card.set("author", actor);
    card.set("comments", new Y.Map());
    log(doc, actor, "created", title);
  });
  return id;
}
export function log(doc, actor, action, title) {
  doc
    .getMap("events")
    .set(crypto.randomUUID(), { actor, action, title, at: Date.now() });
}
export function replaceText(text, value) {
  const old = text.toString();
  let a = 0,
    b = 0;
  while (a < old.length && a < value.length && old[a] === value[a]) a++;
  while (
    b < old.length - a &&
    b < value.length - a &&
    old[old.length - 1 - b] === value[value.length - 1 - b]
  )
    b++;
  text.doc.transact(() => {
    if (old.length > a + b) text.delete(a, old.length - a - b);
    if (value.length > a + b) text.insert(a, value.slice(a, value.length - b));
  });
}
export function seed(doc) {
  doc.getMap("meta").set("title", "Product studio");
  for (const [t, l] of [
    ["Sketch onboarding flow", "Inbox"],
    ["Polish keyboard navigation", "In progress"],
    ["Review release notes", "Review"],
    ["Define launch checklist", "Done"],
  ])
    addCard(doc, t, l);
}
