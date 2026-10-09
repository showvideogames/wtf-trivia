import { useState } from "react";
import Icon from "./Icon.jsx";
import { copyText } from "../homeShare.js";
import { isQuizSlug, plannedQuizSlug, quizUrl, slugifyTitle } from "../quizSlug.js";

// The quiz's permanent public link, /quiz/<slug> (quizSlug.js): "play this
// quiz". Shown for every puzzle, with Copy Quiz Link.
//
// - A published (or retired) quiz's slug is fixed: links already shared must
//   keep working, so it is shown, never edited (the database refuses a
//   change too).
// - A draft's can be chosen here once the database has the slug column
//   (supabase/migrations/0004_quiz_slugs.sql). Left blank, the database
//   makes one from the title when the quiz is first published.
// - Before that migration runs, every slug is made from the title, so the
//   card says that renaming a quiz would change its link until then.

export default function QuizLink({ game, set, games, nav = typeof navigator === "undefined" ? undefined : navigator }) {
  const [copied, setCopied] = useState(null); // "copied" | "failed" | null
  const isDraft = game.status !== "published" && game.status !== "retired";
  const stored = isQuizSlug(game.slug) ? game.slug : "";
  const fixed = Boolean(stored) && !isDraft;
  const editable = isDraft && game.slugColumn;
  const typed = editable && typeof game.slug === "string" && game.slug.trim() ? slugifyTitle(game.slug) : "";
  const slug = fixed ? stored : typed || stored || plannedQuizSlug(game, games);
  const url = quizUrl(slug);

  const copy = async () => {
    const outcome = await copyText(url, nav);
    setCopied(outcome);
    setTimeout(() => setCopied(null), 2000);
  };

  let note;
  if (!game.slugColumn) note = "Made from the puzzle title for now. Once the database has quiz URLs (supabase/migrations/0004_quiz_slugs.sql), a published quiz’s link is fixed for good.";
  else if (fixed) note = "Permanent: this quiz is published, so its link never changes, even if the title does.";
  else if (stored || typed) note = "Fixed once the quiz is published.";
  else note = "Made from the title when the quiz is first published, then fixed.";

  return (
    <section className="ps-panel ps-card" aria-labelledby="ps-quizlink-title">
      <div className="ps-card-head">
        <span className="ps-section-icon is-teal"><Icon name="link" size={22}/></span>
        <div>
          <h2 id="ps-quizlink-title">Quiz link</h2>
          <p>The quiz&rsquo;s own public address: &ldquo;play this quiz&rdquo;. Result links (/s/&hellip;) stay separate.</p>
        </div>
      </div>
      <div className="ps-field">
        <div className="ps-label" id="ps-quizlink-label">Quiz URL</div>
        <div className="ps-quizlink-row">
          <code className="ps-quizlink-url" aria-labelledby="ps-quizlink-label" data-testid="quiz-url">{url}</code>
          <button type="button" className="ps-btn ps-btn-sm" onClick={copy}>
            <Icon name={copied === "copied" ? "check" : "link"} size={16}/>
            {copied === "copied" ? "Copied!" : copied === "failed" ? "Couldn’t copy" : "Copy Quiz Link"}
          </button>
        </div>
        <div className="ps-hint">{note}{isDraft ? " The link opens once the quiz is published and its day has come." : ""}</div>
      </div>
      {editable && (
        <div className="ps-field">
          <label className="ps-label" htmlFor="ps-quizlink-slug">Quiz URL name</label>
          <input id="ps-quizlink-slug" className="ps-input" value={game.slug || ""} placeholder={plannedQuizSlug(game, games)}
                 onChange={(e) => set("slug", e.target.value)}
                 onBlur={(e) => set("slug", slugifyTitle(e.target.value))}/>
          <div className="ps-hint">Lowercase words and hyphens. Blank uses the title.</div>
        </div>
      )}
    </section>
  );
}
