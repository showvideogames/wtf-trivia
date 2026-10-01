import { useId, useState } from "react";

// Nerd Mode audience split. Every answer is one of the two categories, so the
// share choosing each side follows from the correct count and the answer key.
// The correct side is rounded exactly like "N% of players got it right" and
// the other side takes the remainder, so the pair always adds to 100.
function categorySplit(correctCategory, correctCount, answeredCount) {
  if (!(answeredCount > 0) || (correctCategory !== "A" && correctCategory !== "B")) return null;
  const correctPct = Math.round(correctCount / answeredCount * 100);
  return correctCategory === "A" ? { A: correctPct, B: 100 - correctPct } : { A: 100 - correctPct, B: correctPct };
}

function Glasses() {
  return (
    <svg className="rs-nerd-glasses" viewBox="0 0 40 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5"/>
      <circle cx="30" cy="10" r="7.5"/>
      <path d="M17.5 9.5 Q20 7 22.5 9.5"/>
    </svg>
  );
}

// Nerd Mode: per question, how the audience split between the two
// categories (A always left, B always right, in their gameplay colours),
// which side was correct, and which side this player picked. Category
// colour, ✓ Correct and YOU are three separate signals. The visual split is
// aria-hidden; .rs-sr carries the same result as one sentence. Closed until
// the player opens it.
//   accuracies: communityStats.questionAccuracies
//   categories: { A: { name, color }, B: { name, color } } (PALETTE entries)
//   picks:      Map of questionIndex -> "A" | "B" for this player
export default function ResultsNerdMode({ accuracies, questions, categories, picks }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className="rs-nerd">
      <h2 className="rs-nerd-heading">
        <button type="button" className="rs-nerd-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId}>
          <Glasses/>
          <span className="rs-nerd-title">Nerd Mode <span className="rs-nerd-dash">&mdash;</span> <span className="rs-nerd-sub">Question breakdown</span></span>
          <span className="rs-nerd-action">{open ? "Hide" : "Show"}</span>
          <span className="rs-chevron" aria-hidden="true"/>
        </button>
      </h2>
      {open && (
        <div className="rs-nerd-grid" id={panelId}>
          {(Array.isArray(accuracies) ? accuracies : []).map((q) => {
            const question = questions?.[q.index];
            const correctCat = question?.correctCategory;
            const split = categorySplit(correctCat, q.correct, q.answered);
            const pick = picks.get(q.index);
            const summary = split && [
              ...["A", "B"].map((cat) => `${split[cat]}% chose ${categories[cat].name}${cat === correctCat ? ", the correct answer" : ""}.`),
              pick ? `You chose ${categories[pick].name}.` : "",
            ].join(" ").trim();
            return (
              <div key={q.index} className="rs-q">
                <div className="rs-q-num">Question {q.index + 1}</div>
                <div className="rs-q-title">{question?.itemText || "Accuracy"}</div>
                {!(q.answered > 0) ? (
                  <div className="rs-q-sub">No community answers for this one yet.</div>
                ) : (
                  <div className="rs-q-sub">{q.correctRate}% of players got it right</div>
                )}
                {split && (
                  <>
                    <div className="rs-split" aria-hidden="true">
                      <div className="rs-split-bar">
                        {["A", "B"].map((cat) => {
                          const c = categories[cat].color;
                          return <span key={cat} style={{ flexBasis: `${split[cat]}%`, background: `linear-gradient(180deg,${c.light} 0%,${c.mid} 100%)` }}/>;
                        })}
                      </div>
                      <div className="rs-split-sides">
                        {["A", "B"].map((cat) => {
                          const c = categories[cat].color;
                          return (
                            <div key={cat} className={`rs-side rs-side-${cat.toLowerCase()}`}>
                              <div className="rs-side-label">
                                <span className="rs-side-pct" style={{ color: c.isDark ? c.dark : "var(--black)" }}>
                                  <span className="rs-swatch" style={{ background: c.mid, borderColor: c.dark }}/>{split[cat]}%
                                </span>
                                <span className="rs-side-name">{categories[cat].name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* One shared marker row: A's markers hug the left
                          edge, B's the right, so two pills on one side
                          never have to squeeze into a half-width column. */}
                      <div className="rs-split-marks">
                        {["A", "B"].map((cat) => (
                          <div key={cat} className={`rs-marks rs-marks-${cat.toLowerCase()}`}>
                            {correctCat === cat && <span className="rs-correct">✓ Correct</span>}
                            {pick === cat && <span className="rs-you">You</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="rs-sr">{summary}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
