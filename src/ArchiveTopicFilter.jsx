import { topicDisplay } from "./topics.js";

// The Archive's topic menu: one native select (so keyboards, screen readers
// and phone pickers all work as people expect) dressed as a candy pill. It
// turns pink while a topic is chosen, and the round × beside it goes back to
// All topics. `topics` comes from archiveTopicCounts: only topics in use,
// each with its count.
export default function ArchiveTopicFilter({topics, total, value, onChange}){
  const active = value!=="all";
  const chosen = topics.find(t=>t.id===value);
  return(
    <div className={`arc-topic${active?" is-active":""}`}>
      <div className="arc-topic-field">
        <label className="arc-sr-only" htmlFor="arc-topic-select">Filter by topic</label>
        <select id="arc-topic-select" className="arc-topic-select" value={value} onChange={e=>onChange(e.target.value)}>
          <option value="all">All topics · {total}</option>
          {topics.map(t=>(
            <option key={t.id} value={t.id}>{topicDisplay(t)} · {t.count}</option>
          ))}
        </select>
        <svg className="arc-topic-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {active&&(
        <button type="button" className="arc-topic-clear" onClick={()=>onChange("all")}
                aria-label={`Clear the ${chosen?.label||"topic"} filter and show all topics`} title="Show all topics">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
