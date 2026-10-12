// Readiness of a puzzle's questions, as the Puzzle Studio shows it. This is
// guidance only: the publish rules are unchanged (4–15 questions, a free
// date), and nothing here blocks a save except a question with no item text.

import { previewReleased } from "../puzzleMeta.js";

export const MIN_QUESTIONS = 4;
export const MAX_QUESTIONS = 15;

// Older questions (and the offline demo's) may have no id, so the editor
// falls back to the position. Stored questions are never given new ids.
export function questionKey(q, index){
  return q?.id ?? `idx-${index}`;
}

export function hasText(value){
  return typeof value==="string" && value.trim().length>0;
}

export function mediaKind(url, isYouTube){
  if(!hasText(url)) return "none";
  return isYouTube(url) ? "video" : "image";
}

// What a question still lacks, in the order the editor shows the fields.
export function questionGaps(q, isYouTube){
  const gaps = [];
  if(!hasText(q?.itemText)) gaps.push("Item text");
  if(!hasText(q?.flavorCopy)) gaps.push("Needless Commentary");
  if(!hasText(q?.explanationCopy)) gaps.push("Actual Info");
  if(mediaKind(q?.imageUrl, isYouTube)==="image" && !hasText(q?.imageAlt)) gaps.push("Alt text");
  return gaps;
}

// One short status per question: "Complete", or only what's missing, e.g.
// "Missing commentary and explanation". Guidance only; nothing is blocked.
const GAP_WORDS = {"Item text":"item text", "Actual Info":"explanation", "Needless Commentary":"commentary", "Alt text":"alt text"};
export function missingSummary(gaps){
  if(!gaps.length) return "Complete";
  const words = gaps.map(g=>GAP_WORDS[g]||g.toLowerCase());
  const list = words.length===1 ? words[0] : `${words.slice(0,-1).join(", ")} and ${words.at(-1)}`;
  return `Missing ${list}`;
}

export function countReady(questions, isYouTube){
  return (questions||[]).filter(q=>questionGaps(q, isYouTube).length===0).length;
}

export function questionCountOk(count){
  return count>=MIN_QUESTIONS && count<=MAX_QUESTIONS;
}

// Index of the first question the database save must not accept.
export function firstBlankItem(questions){
  return (questions||[]).findIndex(q=>!hasText(q?.itemText));
}

// Moves one question and renumbers orderIndex, like the drag reorder always has.
export function moveQuestion(questions, from, to){
  const list = [...(questions||[])];
  if(from<0||from>=list.length||to<0||to>=list.length||from===to) return questions;
  const [moved] = list.splice(from,1);
  list.splice(to,0,moved);
  return list.map((q,i)=>({...q,orderIndex:i+1}));
}

// Where the selected question ends up after a move.
export function followMove(selected, from, to){
  if(typeof selected!=="number") return selected;
  if(selected===from) return to;
  if(from<selected && to>=selected) return selected-1;
  if(from>selected && to<=selected) return selected+1;
  return selected;
}

// A whole number in [0, max), uniformly, from the browser's cryptographic
// random source. Draws at or above the largest multiple of max are thrown
// away and redrawn, so no value is favoured by the modulo.
export function secureRandomInt(max, getRandomValues = (a)=>globalThis.crypto.getRandomValues(a)){
  if(!Number.isInteger(max) || max<1 || max>0x100000000) throw new RangeError("max must be 1 to 2^32");
  const limit = Math.floor(0x100000000/max)*max;
  const draw = new Uint32Array(1);
  do{ getRandomValues(draw); }while(draw[0]>=limit);
  return draw[0]%max;
}

// A uniformly random order for n questions (Fisher–Yates): every order is
// equally likely, with no balancing or alternation of anything. Returns
// `order`, where new position i holds old question order[i].
export function shuffleOrder(n, randomInt = secureRandomInt){
  const order = Array.from({length:n}, (_, i)=>i);
  for(let i=n-1; i>0; i--){
    const j = randomInt(i+1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// The questions in `order` (from shuffleOrder), each one whole (its item,
// answer, commentary, media and id travel together), renumbered like a move.
export function applyOrder(questions, order){
  return order.map((from, i)=>({...questions[from], orderIndex:i+1}));
}

// Undoes applyOrder: puts each question back where it was, keeping any edit
// made to it since. `before` (the list as it was) gives back each one's own
// orderIndex, so an undone shuffle leaves nothing changed.
export function undoOrder(questions, order, before){
  const back = new Array(order.length);
  order.forEach((from, i)=>{ back[from] = {...questions[i], orderIndex:before ? before[from]?.orderIndex : from+1}; });
  return back;
}

// A question's identity for ordering: its id, or its item text if it has
// none. Same rule as public.wtf_question_order_changed (migration 0005).
const orderKey = q => q?.id ?? `item:${q?.itemText ?? ""}`;

// Whether the questions present in both lists come in a different order.
// Editing, adding or removing a question is not a reorder.
export function questionOrderChanged(before, after){
  const a = (before||[]).map(orderKey), b = (after||[]).map(orderKey);
  const inA = new Set(a), inB = new Set(b);
  const x = a.filter(k=>inB.has(k)), y = b.filter(k=>inA.has(k));
  return x.length!==y.length || x.some((k, i)=>k!==y[i]);
}

// The one rule for every way of reordering questions (Shuffle Order, drag,
// Move up/down) and for saving a new order. A play stores its answers by
// position (saved games, Nerd Mode, puzzle stats, shared /s/ result links),
// so a played puzzle's order must never change. A puzzle's date can't prove
// that (a played puzzle can be moved to a future day), so a saved puzzle is
// only reorderable once the server says it has no saved plays.
//   saved:   the puzzle exists in the database
//   stored:  the puzzle as saved (status, date)
//   history: the server's answer: "unplayed" | "played" | "checking" | "unknown"
// Returns why the order is locked, or null when reordering is safe.
export function reorderLock({saved, stored, history}, now = new Date()){
  if(!saved) return null;
  if(stored?.status==="retired") return "retired";
  if(previewReleased(stored, now)) return "live";
  if(history==="unplayed") return null;
  if(history==="played"||history==="checking") return history;
  return "unknown";
}

// The current questions put back in the saved order (and saved orderIndex),
// edits kept. Questions
// added since keep their places relative to each other, after the saved
// ones (so questionOrderChanged(saved, result) is false).
export function restoreOrder(current, saved){
  const at = new Map((saved||[]).map((q, i)=>[orderKey(q), i]));
  const rank = q=>at.has(orderKey(q)) ? at.get(orderKey(q)) : Infinity;
  return (current||[]).map((q, i)=>({q, i})).sort((x, y)=>rank(x.q)-rank(y.q) || x.i-y.i)
    .map(({q})=>at.has(orderKey(q)) ? {...q, orderIndex:saved[at.get(orderKey(q))].orderIndex} : q);
}

export const REORDER_LOCK_TEXT = {
  played: "Question order is locked: people have played this puzzle, and their answers are matched to questions by position.",
  live: "Question order is locked: this puzzle is live, and players' answers are matched to questions by position.",
  retired: "Question order is locked: this puzzle has been played, and players' answers are matched to questions by position.",
  checking: "Checking whether anyone has played this puzzle before allowing reordering…",
  unknown: "Question order is locked: couldn't confirm that nobody has played this puzzle.",
};
