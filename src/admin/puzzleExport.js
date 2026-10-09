// "Export text": the editor's current puzzle (unsaved edits included) as a
// readable plain-text file, for reading or pasting into a conversation.
// Pure functions; the editor does the download. Only puzzle content goes in:
// nothing about the account, the session or the browser.
import { answerButtonName } from "../categoryNames.js";
import { shareCategoryName, normalizeShareLabel } from "../share.js";
import { topicById } from "../topics.js";

const BLANK = "(blank)";
// Question fields the export already lays out by name. Anything else a
// question carries (older editorial fields) is listed under "Other fields".
const KNOWN_QUESTION_FIELDS = new Set(["id", "orderIndex", "itemText", "correctCategory", "flavorCopy", "explanationCopy", "imageUrl", "imageAlt", "imageSource"]);

const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value));
const filled = (value) => text(value).trim().length > 0;

// One labelled value. A multi-line value starts on the next line, indented,
// with its line breaks kept exactly.
function field(label, value, indent = "  ") {
  const v = text(value).replace(/\r\n?/g, "\n");
  if (!filled(v)) return `${indent}${label}: ${BLANK}`;
  if (!v.includes("\n")) return `${indent}${label}: ${v}`;
  return [`${indent}${label}:`, ...v.split("\n").map((line) => `${indent}    ${line}`)].join("\n");
}

// Images that only exist in this browser (picked but not uploaded until the
// next save) would be huge or meaningless as text, so they're described.
function mediaUrl(url) {
  const v = text(url).trim();
  if (/^data:/i.test(v)) return "(new image picked on this device, not uploaded yet; it uploads on the next save)";
  if (/^blob:/i.test(v)) return "(new image on this device, not uploaded yet; it uploads on the next save)";
  return v;
}

function colorLine(game, side, palette) {
  const fallback = side === "A" ? "teal" : "pink";
  const stored = game?.[`category${side}Color`];
  const find = (id) => palette.find((p) => p.id === id);
  const shown = find(stored || fallback) || palette[side === "A" ? 0 : 1];
  const describe = (p) => (p ? `${p.name} (${p.id}, ${p.mid})` : "unknown");
  if (!stored) return `${describe(shown)}, the default (nothing stored)`;
  if (!find(stored)) return `"${stored}" is stored but isn't in the palette; players see ${describe(shown)}`;
  return describe(shown);
}

function categoryBlock(game, side, palette) {
  const matchup = text(game?.[`category${side}`]);
  const button = normalizeShareLabel(game?.[`category${side}ButtonName`]);
  const share = normalizeShareLabel(game?.[`category${side}ShareName`]);
  const effectiveButton = answerButtonName(game, side);
  const effectiveShare = shareCategoryName(game?.[`category${side}ShareName`], game?.[`category${side}`], `Category ${side}`);
  return [
    `CATEGORY ${side}`,
    field("Matchup name (banner, Home, Archive, reveal)", matchup),
    field("Matchup subtitle (second banner line)", game?.[`category${side}Subtitle`]),
    button
      ? field("Answer button name", button)
      : `  Answer button name: ${BLANK}, so the button shows "${effectiveButton || `Category ${side}`}"`,
    share
      ? field("Share name", share)
      : `  Share name: ${BLANK}, so the share text shows "${effectiveShare}"`,
    `  Color: ${colorLine(game, side, palette)}`,
    field("Category image", mediaUrl(game?.[`category${side}Image`])),
  ].join("\n");
}

function mediaLines(q, isYouTube) {
  const url = text(q?.imageUrl).trim();
  if (!url) return ["  Reveal media: none"];
  const video = isYouTube(url);
  const lines = [`  Reveal media: ${video ? "YouTube video" : "Image"}`, field("Media URL", mediaUrl(url), "    ")];
  if (!video) lines.push(field("Alt text", q?.imageAlt, "    "));
  lines.push(field("Media source", q?.imageSource, "    "));
  return lines;
}

function questionBlock(q, i, game, isYouTube) {
  const side = q?.correctCategory === "B" ? "B" : "A";
  const name = text(game?.[`category${side}`]).trim() || `Category ${side}`;
  const button = answerButtonName(game, side);
  const correct = `${side}, ${name}${button && button !== name ? ` (answer button: "${button}")` : ""}`;
  const lines = [
    `Question ${i + 1}`,
    field("Item text", q?.itemText),
    `  Correct category: ${correct}`,
    field("Needless Commentary", q?.flavorCopy),
    field("Actual Info", q?.explanationCopy),
    ...mediaLines(q, isYouTube),
  ];
  // Older editorial fields this export doesn't name. Alt text and source of
  // a question without media are kept too, since they're still stored.
  const extra = Object.keys(q || {}).filter((k) => !KNOWN_QUESTION_FIELDS.has(k) && !k.startsWith("_") && filled(typeof q[k] === "object" ? JSON.stringify(q[k]) : q[k]));
  if (!filled(q?.imageUrl)) {
    if (filled(q?.imageAlt)) extra.unshift("imageAlt");
    if (filled(q?.imageSource)) extra.unshift("imageSource");
  }
  if (extra.length) {
    lines.push("  Other fields:");
    for (const k of extra) lines.push(field(k, typeof q[k] === "object" ? JSON.stringify(q[k]) : q[k], "    "));
  }
  return lines.join("\n");
}

const STATUS = { draft: "Draft", published: "Published", retired: "Retired" };

// The whole file. `now` and the options are passed in so it stays testable.
//   palette    the category colour list ({id, name, mid})
//   isYouTube  url => true for a YouTube link
//   unsaved    true when the editor has changes not yet saved
export function buildPuzzleExport(game, { palette = [], isYouTube = () => false, unsaved = false, now = new Date() } = {}) {
  const questions = Array.isArray(game?.questions) ? game.questions : [];
  const tags = (Array.isArray(game?.tags) ? game.tags : []).map((id) => {
    const t = topicById(id);
    return t ? `${t.label} ${t.emoji}` : `${id} (unknown topic)`;
  });
  const status = STATUS[game?.status] || (game?.status ? text(game.status) : "Draft");
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const sections = [
    [
      "WHAT THE FUDGE TRIVIA: PUZZLE EXPORT",
      `Exported ${stamp} from Puzzle Studio. This is the editor's current state${unsaved ? ", including changes that are NOT saved yet" : ", which matches the last save"}.`,
      `Blank values are shown as ${BLANK}.`,
    ].join("\n"),
    [
      "PUZZLE",
      field("Puzzle ID", game?.id),
      field("Title", game?.themeTitle),
      field("Scheduled date", game?.date),
      `  Status: ${status}`,
      `  Topics: ${tags.length ? tags.join(", ") : BLANK}`,
      field("Square poster (Home)", mediaUrl(game?.headerImage)),
      field("Wide artwork (shares, Up Next, short screens)", mediaUrl(game?.wideImage)),
      field("Silhouette artwork (Tomorrow teaser)", mediaUrl(game?.silhouetteImage)),
      `  Questions: ${questions.length}`,
    ].join("\n"),
    categoryBlock(game, "A", palette),
    categoryBlock(game, "B", palette),
    questions.length
      ? ["QUESTIONS (in play order)", ...questions.map((q, i) => questionBlock(q, i, game, isYouTube))].join("\n\n")
      : `QUESTIONS\n  ${BLANK}: no questions yet`,
  ];
  return `${sections.join("\n\n")}\n`;
}

// A filename from the title (and date), plain ASCII so it works anywhere:
// "Led Zeppelin OR My Little Pony Song?" -> "led-zeppelin-or-my-little-pony-song-2026-12-14.txt".
export function exportFileName(game) {
  const slug = text(game?.themeTitle)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60).replace(/-+$/, "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text(game?.date)) ? game.date : "";
  const base = [slug || "untitled-puzzle", date].filter(Boolean).join("-");
  return `${base}.txt`;
}

// Saves `body` as a UTF-8 text file, entirely in the browser.
export function downloadTextFile(name, body) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
