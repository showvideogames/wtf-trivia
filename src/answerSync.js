// ---- ANSWER SAVES ----
// While a game is played, each answer is saved on its own, and the saves
// can reach the database out of order. Two rules keep everything moving
// forward only:
//
//   1. In the database (the real protection): an answer save only lands on
//      an unfinished record holding FEWER answers than the save carries. A
//      late, older save matches no row and changes nothing, so a saved
//      record's answers (and the position derived from them) never move
//      backward, and a finished game is never touched by an answer save.
//      dbRecordAnswer (App.jsx) sends this as answerWriteFilter; the
//      offline dev backend applies answerWriteApplies.
//
//   2. On Home: App's copy of today's record (behind "N of M answered" /
//      Keep going!) moves only once a save has actually landed.
//
// Saves are independent, so a failed one never holds up the next. Gameplay
// keeps its own record and is unaffected either way.

// PostgREST filters, added to the row's own player/puzzle filter: the game
// is unfinished and has no answer yet at this save's last position (the
// stored array is shorter). `answers` is jsonb; `->>N` is an array index.
export function answerWriteFilter(answers) {
  return `completed=eq.false&answers->>${answers.length - 1}=is.null`;
}

// The same rule in plain JS, for the offline backend and the tests.
export function answerWriteApplies(stored, answers) {
  return Boolean(stored) && !stored.completed && (stored.answers?.length || 0) < answers.length;
}

// The record Home should hold after a save landed: unchanged unless it is
// today's unfinished game and the save carries more answers than it has.
export function syncedRecord(record, puzzleId, answers, score) {
  if (!record || record.puzzleId !== puzzleId || record.completed) return record;
  if ((record.answers?.length || 0) >= answers.length) return record;
  return { ...record, answers, score, currentIndex: answers.length };
}

// Runs the save, which resolves true when it landed and false when the
// database already had as much or more (or throws when it failed). Only a
// save that landed updates Home's record, via setRecord (a React state
// setter). Failures are swallowed, as before. Resolves to whether it landed.
export async function saveAnswerThenSync({ save, setRecord, puzzleId, answers, score }) {
  let landed;
  try {
    landed = await save();
  } catch {
    return false;
  }
  if (!landed) return false;
  setRecord((record) => syncedRecord(record, puzzleId, answers, score));
  return true;
}
