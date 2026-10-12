import { formatLongDate } from "./adminDates.js";

// What the Delete and Retire confirmations say (ConfirmDialog), for the
// puzzle as it is stored: its saved name, status, date and question count.
// Each line states what that action really does to this puzzle.
export function puzzleActionCopy(kind, game){
  const name = game?.themeTitle?.trim() || "Untitled puzzle";
  const n = game?.questions?.length || 0;
  const questions = `${n} question${n===1?"":"s"}`;
  const isDraft = game?.status!=="published" && game?.status!=="retired";
  if(kind==="retire"){
    const day = formatLongDate(game?.date);
    return {
      title: `Retire “${name}”?`,
      confirmLabel: "Retire puzzle",
      lines: [
        "Players stop seeing it: it leaves Home and the Archive, and its links no longer open it. Anyone who already played it still finds it in their own Archive, marked Retired.",
        day ? `${day} becomes free for another puzzle.` : "Its date becomes free for another puzzle.",
        "Nothing is deleted: its questions, plays and stats are kept, and you can publish it again later if its date is still free.",
      ],
    };
  }
  return {
    title: isDraft ? `Delete draft “${name}”?` : `Delete “${name}”?`,
    confirmLabel: isDraft ? "Delete draft" : "Delete puzzle",
    lines: isDraft
      ? [`This permanently removes the draft and its ${questions}. Players never saw it.`, "This can't be undone."]
      : [
        `This permanently removes the puzzle and its ${questions}, and its links stop working.`,
        "It only works if nobody has played it yet. If anyone has, nothing is deleted; retire it instead.",
        "This can't be undone.",
      ],
  };
}

const side = v=>v==="B" ? "B" : "A";

// Whether changing a question's correct answer must be confirmed first: the
// puzzle may have plays (questionLock gave a reason) and the pick moves the
// answer away from the saved one. Going back to the saved answer never asks.
export function answerCorrectionNeedsConfirm({lock, question, saved, next}){
  if(!lock || !saved) return false;
  return side(next)!==side(question?.correctCategory) && side(next)!==side(saved.correctCategory);
}

// What that confirmation says: plays already saved keep the old answer.
export function answerCorrectionCopy({itemText, number, name}){
  const label = itemText?.trim() ? `“${itemText.trim()}”` : `question ${number}`;
  return {
    title: `Change the correct answer for ${label}?`,
    confirmLabel: "Change answer",
    lines: [
      `The correct answer becomes ${name}.`,
      "Results already saved won't be recalculated: past scores, right and wrong marks, shared result links and this puzzle's stats keep the old answer.",
      "Only new plays use the corrected answer, once you save or publish the change.",
    ],
  };
}
