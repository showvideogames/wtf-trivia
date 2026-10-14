// Picture quizzes: a quiz-level option (games.picture_quiz, migration 0007)
// where each question shows an uploaded picture in place of its name. The
// name (itemText) is still stored: it organizes the questions in the Studio
// and is shown to players only after they answer.
//
// Per question:
//   questionImage     the picture players identify (its own field, never the
//                     reveal media in imageUrl)
//   questionImageAlt  a neutral description of the picture for assistive
//                     tech, written without naming the answer
//
// Turning the option off hides these fields without clearing them, so
// turning it back on brings every picture back.
import { usableMediaUrl } from "./mediaPreloader.js";

// Read by screen readers when a question has no description of its own:
// neutral, so it never names the answer.
export const PICTURE_ALT_FALLBACK = "Picture clue";

export function isPictureQuiz(game){
  return game?.pictureQuiz === true;
}

// The picture's address if it is one worth requesting, else null (missing,
// blank or malformed values all mean "no picture").
export function questionPicture(q){
  return usableMediaUrl(q?.questionImage);
}

export function pictureAlt(q){
  const alt = typeof q?.questionImageAlt === "string" ? q.questionImageAlt.trim() : "";
  return alt || PICTURE_ALT_FALLBACK;
}

// Index of the first question a picture quiz can't be published with (no
// usable picture), or -1. Drafts may be saved without pictures.
export function firstMissingPicture(questions){
  return (questions||[]).findIndex(q=>!questionPicture(q));
}

export function countPictures(questions){
  return (questions||[]).filter(q=>questionPicture(q)).length;
}

// Whether a description gives the answer away by containing the answer's
// name (case and spacing ignored). Guidance only, shown in the Studio.
export function descriptionNamesAnswer(q){
  const squash = v=>(typeof v==="string" ? v : "").toLowerCase().replace(/\s+/g, " ").trim();
  const name = squash(q?.itemText), alt = squash(q?.questionImageAlt);
  return name.length>=3 && alt.includes(name);
}

// The image each question needs first, index-aligned with the questions, for
// the gameplay preloader: a picture quiz's pictures (shown before the
// answer), otherwise the reveal stills. null where there's nothing to warm.
export function gameplayImageUrls(game, isYouTube = () => false){
  const picture = isPictureQuiz(game);
  return (game?.questions||[]).map(q=>{
    if(picture) return questionPicture(q);
    const url = usableMediaUrl(q?.imageUrl);
    return url && !isYouTube(url) ? url : null;
  });
}
