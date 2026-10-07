// ---- GAME PROGRESS ----
// The "QUESTION N OF TOTAL" label, then exactly one dot per real
// question -- solid teal once reached (answered or current), pale mint with
// a teal outline while upcoming. Never a colour that would leak whether an
// earlier answer was right. A short "N / TOTAL" form of the label is also
// rendered, for short phone screens, where paperLook.css shows it on one row
// with the dots instead of the full label. Assistive tech hears it once, as a
// progress bar ("Question 3 of 10"); both labels and the dots themselves are
// hidden from it, so nothing is announced twice or dot by dot. Styles:
// game.css, paperLook.css.
export default function GameProgress({ total, currentIndex }) {
  const n = Math.min(currentIndex + 1, total);
  // Long puzzles step the dots down so the row still fits at 360px.
  const size = total > 16 ? 10 : total > 12 ? 12 : 14;
  return (
    <div className="gp-progress">
      <span className="gp-qpill" aria-hidden="true">Question {n} of {total}</span>
      <span className="gp-qshort" aria-hidden="true">{n} / {total}</span>
      <div className="gp-dots" role="progressbar" aria-label="Puzzle progress"
           aria-valuemin={1} aria-valuemax={total} aria-valuenow={n} aria-valuetext={`Question ${n} of ${total}`}
           style={{ "--gp-dot-size": `${size}px` }}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i <= currentIndex ? "gp-dot is-reached" : "gp-dot"}/>
        ))}
      </div>
    </div>
  );
}
