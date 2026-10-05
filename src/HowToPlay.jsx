import { useEffect, useRef } from "react";
import "./howToPlay.css";

// How to Play: three illustrated steps (read the clue, pick a side, enjoy
// the reveal). The illustrations are pictures only -- nothing in them is a
// control, and opening the dialog never touches a game record.
// Escape, a press on the backdrop and Let's play! all close it; Tab is
// kept inside while it is open, and focus goes back to whatever opened it.
// "Let's play!" calls onPlay (to Home) when given, else just closes.
export default function HowToPlay({ onClose, onPlay }) {
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    // Focus the dialog itself so a short screen opens at the title.
    boxRef.current?.focus();
    const onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== "Tab" || !boxRef.current) return;
      const items = boxRef.current.querySelectorAll("button:not([disabled])");
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === boxRef.current || !boxRef.current.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div className="htp-bg" onClick={onClose}>
      <div className="htp-modal" ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true"
           aria-labelledby="htp-title" aria-describedby="htp-intro"
           onClick={e => e.stopPropagation()}>
        <h2 id="htp-title" className="htp-title">
          <Sparks/>How to play<Sparks flip/>
        </h2>
        <p id="htp-intro" className="htp-intro">Each clue belongs to one of two ridiculous categories.</p>

        <ol className="htp-steps">
          <li className="htp-step">
            <span className="htp-num htp-num-1" aria-hidden="true">1</span>
            <h3 className="htp-step-title">Read the clue</h3>
            <div className="htp-pic htp-pic-clue" aria-hidden="true">
              <Sparks small/><span className="htp-clue">Miss Piggy</span><Sparks small flip/>
            </div>
          </li>
          <li className="htp-step">
            <span className="htp-num htp-num-2" aria-hidden="true">2</span>
            <h3 className="htp-step-title">Pick a side</h3>
            <div className="htp-pic htp-pic-pick" aria-hidden="true">
              <span className="htp-choice htp-choice-a">
                <TapRays/>Muppet<TapHand/>
              </span>
              <span className="htp-choice htp-choice-b">Rapper</span>
            </div>
          </li>
          <li className="htp-step">
            <span className="htp-num htp-num-3" aria-hidden="true">3</span>
            <h3 className="htp-step-title">Enjoy the reveal</h3>
            <div className="htp-pic htp-pic-reveal" aria-hidden="true">
              <span className="htp-strip htp-strip-info"><DocIcon/>Actual info</span>
              <span className="htp-strip htp-strip-comm"><BubbleIcon/>Needless commentary</span>
            </div>
          </li>
        </ol>

        <p className="htp-outro">Finish the puzzle, compare scores, and share without spoilers.</p>
        <button type="button" className="htp-play" onClick={onPlay || onClose}>
          <span className="htp-play-label">Let’s play!</span>
        </button>
      </div>
    </div>
  );
}

function Sparks({ flip, small }) {
  return (
    <svg className={`htp-sparks${flip ? " is-flip" : ""}${small ? " is-small" : ""}`} viewBox="0 0 20 30" aria-hidden="true">
      <path d="M4 4l9 7M2 26l11-4" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function TapRays() {
  return (
    <svg className="htp-rays" viewBox="0 0 40 16" aria-hidden="true">
      <path d="M8 6l4 7M20 2v10M32 6l-4 7" stroke="#FFC21A" strokeWidth="3.4" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function TapHand() {
  return (
    <svg className="htp-hand" viewBox="0 0 32 36" aria-hidden="true">
      <path d="M11 4.5c0-1.9 3.6-1.9 3.6 0v11.2l.1-2.4c0-1.9 3.6-1.9 3.6 0v2.6c0-1.9 3.6-1.9 3.6 0v2.4c0-1.8 3.4-1.8 3.4 0v6.8c0 5.6-3.6 9.4-8.8 9.4h-1.7c-3.2 0-5.2-1.3-7-3.9L3.4 22c-1-1.6 1-3.4 2.6-2.1L11 24V4.5z"
            fill="#fff" stroke="#1a1a1a" strokeWidth="2.4" strokeLinejoin="round"/>
    </svg>
  );
}

function DocIcon() {
  return (
    <svg className="htp-strip-icon" viewBox="0 0 22 28" aria-hidden="true">
      <rect x="2" y="2" width="18" height="24" rx="2.5" fill="#fff" stroke="currentColor" strokeWidth="2.4"/>
      <path d="M6.5 9h9M6.5 13.5h9M6.5 18h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg className="htp-strip-icon" viewBox="0 0 28 26" aria-hidden="true">
      <path d="M14 2.5c6.6 0 11.5 4 11.5 9s-4.9 9-11.5 9c-1.2 0-2.3-.1-3.4-.4L4.5 23.5l1.7-5C4 16.9 2.5 14.4 2.5 11.5c0-5 4.9-9 11.5-9z"
            fill="#fff" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/>
    </svg>
  );
}
