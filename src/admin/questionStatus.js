// Readiness of a puzzle's questions, as the Puzzle Studio shows it. This is
// guidance only: the publish rules are unchanged (4–15 questions, a free
// date, and for a picture quiz a picture on every question), and nothing
// here blocks a save except a question with no item text.

import { previewReleased } from "../puzzleMeta.js";
import { questionPicture } from "../pictureQuiz.js";

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
// A picture quiz's question (picture: true) also needs its picture and a
// neutral description of it, and its item text is called the answer name.
export function questionGaps(q, isYouTube, {picture = false} = {}){
  const gaps = [];
  if(picture){
    if(!questionPicture(q)) gaps.push("Picture");
    else if(!hasText(q?.questionImageAlt)) gaps.push("Picture description");
  }
  if(!hasText(q?.itemText)) gaps.push(picture ? "Answer name" : "Item text");
  if(!hasText(q?.flavorCopy)) gaps.push("Needless Commentary");
  if(!hasText(q?.explanationCopy)) gaps.push("Actual Info");
  if(mediaKind(q?.imageUrl, isYouTube)==="image" && !hasText(q?.imageAlt)) gaps.push("Alt text");
  return gaps;
}

// One short status per question: "Complete", or only what's missing, e.g.
// "Missing commentary and explanation". Guidance only; nothing is blocked.
const GAP_WORDS = {"Item text":"item text", "Answer name":"answer name", "Picture":"picture", "Picture description":"picture description",
  "Actual Info":"explanation", "Needless Commentary":"commentary", "Alt text":"alt text"};
export function missingSummary(gaps){
  if(!gaps.length) return "Complete";
  const words = gaps.map(g=>GAP_WORDS[g]||g.toLowerCase());
  const list = words.length===1 ? words[0] : `${words.slice(0,-1).join(", ")} and ${words.at(-1)}`;
  return `Missing ${list}`;
}

export function countReady(questions, isYouTube, options){
  return (questions||[]).filter(q=>questionGaps(q, isYouTube, options).length===0).length;
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

// Whether the question list's structure changed: how many questions there
// are, which question (by id) sits at each position, or their order. Wording,
// commentary, explanation, answer or media edits are not structural. Same
// rule as public.wtf_question_structure_changed (migration 0005).
export function questionStructureChanged(before, after){
  const a = before||[], b = after||[];
  if(a.length!==b.length) return true;
  if(a.some((q, i)=>(q?.id ?? null)!==(b[i]?.id ?? null))) return true;
  return questionOrderChanged(a, b);
}

// The one rule for every structural change to the questions (Add question,
// Delete question, Shuffle Order, drag, Move up/down) and for saving one. A
// play stores its answers by position (saved games, Nerd Mode, puzzle
// stats) and every shared /s/ result link only shows its result while the
// puzzle has exactly that many questions, so a played puzzle's question
// count, order and positions must never change. Its date can't prove it was
// never played (a played puzzle can be moved to a future day), so a saved
// puzzle is only changeable once the server says it has no saved plays.
//   saved:   the puzzle exists in the database
//   stored:  the puzzle as saved (status, date)
//   history: the server's answer: "unplayed" | "played" | "checking" | "unknown"
//   beta:    the temporary beta editing override is on (the server's
//            wtf_beta_editing, migration 0006): nothing is locked, matching
//            the database trigger, which stands aside while it is on.
// Returns why the structure is locked, or null when changing it is allowed.
export function questionLock({saved, stored, history, beta = false}, now = new Date()){
  if(beta) return null;
  if(!saved) return null;
  if(stored?.status==="retired") return "retired";
  if(previewReleased(stored, now)) return "live";
  if(history==="unplayed") return null;
  if(history==="played"||history==="checking") return history;
  return "unknown";
}

// The saved question list again (count, order, positions), with this
// editor's wording and media edits kept for every saved question still
// here. Questions added since are dropped; deleted ones come back as saved.
export function restoreSavedQuestions(current, saved){
  const now = new Map((current||[]).map(q=>[orderKey(q), q]));
  return (saved||[]).map(q=>now.has(orderKey(q)) ? {...now.get(orderKey(q)), orderIndex:q.orderIndex} : q);
}

const KEPT = "Wording and commentary can still be edited.";
export const QUESTION_LOCK_TEXT = {
  played: `Adding, deleting and reordering questions is locked: people have played this puzzle, and their answers and shared results are matched to questions by position. ${KEPT}`,
  live: `Adding, deleting and reordering questions is locked: this puzzle is live, and players' answers and shared results are matched to questions by position. ${KEPT}`,
  retired: `Adding, deleting and reordering questions is locked: this puzzle has been played, and players' answers and shared results are matched to questions by position. ${KEPT}`,
  checking: "Checking whether anyone has played this puzzle before allowing questions to be added, deleted or reordered…",
  unknown: `Adding, deleting and reordering questions is locked: couldn't confirm that nobody has played this puzzle. ${KEPT}`,
};
