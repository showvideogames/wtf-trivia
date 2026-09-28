// Readiness of a puzzle's questions, as the Puzzle Studio shows it. This is
// guidance only: the publish rules are unchanged (4–15 questions, a free
// date), and nothing here blocks a save except a question with no item text.

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
  if(!hasText(q?.explanationCopy)) gaps.push("Actual Info");
  if(!hasText(q?.flavorCopy)) gaps.push("Needless Commentary");
  if(mediaKind(q?.imageUrl, isYouTube)==="image" && !hasText(q?.imageAlt)) gaps.push("Alt text");
  return gaps;
}

// One short status per question: "Complete", or only what's missing, e.g.
// "Missing explanation and commentary". Guidance only; nothing is blocked.
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
