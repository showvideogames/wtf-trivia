import { ARCHIVE_SORTS } from "./archiveList.js";

// The Archive's Sort menu: a native select dressed like the topic menu.
// `availability` maps a sort id to "ready", "loading" or "failed"; a sort
// whose data isn't ready is disabled and says why, rather than showing an
// order that isn't what it claims.
const SUFFIX = { loading: " (loading…)", failed: " (unavailable)" };

export default function ArchiveSortMenu({value, onChange, availability = {}}){
  return(
    <div className="arc-select">
      <label className="arc-select-label" htmlFor="arc-sort-select">Sort</label>
      <div className="arc-topic-field">
        <select id="arc-sort-select" className="arc-topic-select" value={value} onChange={e=>onChange(e.target.value)}>
          {ARCHIVE_SORTS.map(s=>{
            const state = availability[s.id] || "ready";
            return <option key={s.id} value={s.id} disabled={state!=="ready"}>{s.label}{SUFFIX[state]||""}</option>;
          })}
        </select>
        <svg className="arc-topic-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}
