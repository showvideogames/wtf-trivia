// The names a category shows, by where they appear. Display only: answers,
// scoring, records and stats always use the side ("A" / "B"), never a name.
//   matchup name   categoryA / categoryB: the gameplay matchup banner, and
//                  the name used everywhere else (Home, Archive, the reveal)
//   subtitle       categoryASubtitle: optional second line in the banner
//   button name    categoryAButtonName: optional answer-button label
//   share name     categoryAShareName: see shareCategoryName in share.js
import { normalizeShareLabel } from "./share.js";

// The label on one answer button: its button name, or the matchup name
// exactly as before when that's blank.
export function answerButtonName(game, side) {
  return normalizeShareLabel(game?.[`category${side}ButtonName`]) || game?.[`category${side}`] || "";
}
