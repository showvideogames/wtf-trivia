// The on-device draft copy Admin keeps while a draft is edited, as pure
// functions so the save/restore shape can be tested. App.jsx does the
// localStorage reads and writes.
import { normalizeTags } from "../topics.js";

// Where a puzzle's on-device draft copy lives (localStorage).
export function editorDraftKey(id){
  return `wtf-editor-draft:${id||"unsaved"}`;
}

export function normalizeEditorDraft(game){
  return {
    ...game,
    status: game.status==="published"||game.status==="retired" ? game.status : "draft",
    questions: game.questions||[],
    tags: normalizeTags(game.tags)
  };
}

// A stable fingerprint of a puzzle for the "Unsaved changes" check: sorted
// keys, and null / undefined / "" treated alike, so clearing a field that
// was never set doesn't count as a change. trim also ignores spaces around
// strings: a save trims some columns (gameRow.js), so a stored puzzle and the
// copy it was saved from can differ by those alone.
export function editorSnapshot(game, {trim = false} = {}){
  const norm = v=>{
    if(typeof v==="string") return trim ? v.trim() : v;
    if(Array.isArray(v)) return v.map(norm);
    if(v && typeof v==="object"){
      const out = {};
      for(const k of Object.keys(v).sort()){
        const value = norm(v[k]);
        if(value===null||value===undefined||value==="") continue;
        out[k] = value;
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(normalizeEditorDraft(game)));
}

// The puzzle the editor opens with: the stored draft copy over the loaded
// puzzle. shareNameColumns, subtitleColumns, buttonNameColumns, tagsColumn, wideImageColumn and pictureQuizColumn describe the database, not the
// draft, so the loaded puzzle's values always win over whatever an older
// draft recorded. A draft from before topics existed keeps the puzzle's tags,
// and one from before wide artwork existed keeps the puzzle's wide artwork.
export function restoreEditorDraft(game, saved){
  return saved?.game ? {...game, ...saved.game, id: game.id, shareNameColumns: game.shareNameColumns, subtitleColumns: game.subtitleColumns, buttonNameColumns: game.buttonNameColumns, tagsColumn: game.tagsColumn, wideImageColumn: game.wideImageColumn, silhouetteImageColumn: game.silhouetteImageColumn, pictureQuizColumn: game.pictureQuizColumn} : game;
}

// Whether a device copy holds edits the stored puzzle doesn't have. A copy
// that matches isn't edits (every open draft keeps one), published puzzles
// keep none, and a copy that can't be read has nothing to offer.
export function hasDeviceEdits(game, saved){
  if(game.status==="published") return false;
  const copy = saved?.game;
  if(!copy||typeof copy!=="object"||Array.isArray(copy)) return false;
  return editorSnapshot(restoreEditorDraft(game, saved), {trim:true})!==editorSnapshot(game, {trim:true});
}
