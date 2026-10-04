// ---- ANSWER SAVE -> HOME RECORD ----
// While a game is played, each answer is saved on its own. App also keeps a
// copy of today's record, which Home reads to show "N of M answered" /
// Keep going!. That copy only moves forward once a save has actually
// succeeded, so Home never counts an answer the database doesn't have.
// Gameplay keeps its own record and is unaffected either way.

// The record Home should hold after a successful save: unchanged unless it
// is today's unfinished game and the save carries more answers than it has
// (saves can finish out of order; an older one must not wind it back).
export function syncedRecord(record, puzzleId, answers, score) {
  if (!record || record.puzzleId !== puzzleId || record.completed) return record;
  if ((record.answers?.length || 0) >= answers.length) return record;
  return { ...record, answers, score, currentIndex: answers.length };
}

// Runs the save; only on success updates the record via setRecord (a React
// state setter). A failed save is swallowed, as before, and leaves it alone.
// Resolves to whether the save succeeded.
export async function saveAnswerThenSync({ save, setRecord, puzzleId, answers, score }) {
  try {
    await save();
  } catch {
    return false;
  }
  setRecord((record) => syncedRecord(record, puzzleId, answers, score));
  return true;
}
