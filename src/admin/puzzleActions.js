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
