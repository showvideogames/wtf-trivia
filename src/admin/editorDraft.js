// The on-device draft copy Admin keeps while a draft is edited, as pure
// functions so the save/restore shape can be tested. App.jsx does the
// localStorage reads and writes.
import { normalizeTags } from "../topics.js";

export function normalizeEditorDraft(game){
  return {
    ...game,
    status: game.status==="published"||game.status==="retired" ? game.status : "draft",
    questions: game.questions||[],
    tags: normalizeTags(game.tags)
  };
}

// The puzzle the editor opens with: the stored draft copy over the loaded
// puzzle. shareNameColumns, subtitleColumns, buttonNameColumns and tagsColumn describe the database, not the
// draft, so the loaded puzzle's values always win over whatever an older
// draft recorded. A draft from before topics existed keeps the puzzle's tags.
export function restoreEditorDraft(game, saved){
  return saved?.game ? {...game, ...saved.game, id: game.id, shareNameColumns: game.shareNameColumns, subtitleColumns: game.subtitleColumns, buttonNameColumns: game.buttonNameColumns, tagsColumn: game.tagsColumn} : game;
}
