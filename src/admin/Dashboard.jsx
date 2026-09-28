import { useState } from "react";
import Icon from "./Icon.jsx";
import { useStudio } from "./StudioContext.js";
import { daysFrom, formatAdminDate } from "./adminDates.js";
import { groupPuzzles, matchesSearch } from "./dashboardGroups.js";

function whenLabel(today, iso){
  const n = daysFrom(today, iso);
  if(n===null) return "No date";
  if(n===0) return "Today";
  if(n===1) return "Tomorrow";
  if(n>1) return `In ${n} days`;
  return n===-1 ? "Yesterday" : `${-n} days ago`;
}

function StatusBadge({game, today}){
  if(game.status==="retired") return <span className="ps-badge is-retired">Retired</span>;
  if(game.status!=="published") return <span className="ps-badge is-draft">{game.status==="draft"?"Draft":game.status||"Draft"}</span>;
  if(game.date===today) return <span className="ps-badge is-live">Live today</span>;
  if((game.date||"")>today) return <span className="ps-badge is-scheduled">Scheduled</span>;
  return <span className="ps-badge is-published">Published</span>;
}

function questionCount(g){
  const n = g.questions?.length ?? 0;
  return `${n} question${n===1?"":"s"}`;
}

function matchup(g){
  return [g.categoryA, g.categoryB].filter(Boolean).join(" vs ") || "Categories not set";
}

function SectionHead({icon, tone, title, sub, children}){
  return(
    <div className="ps-dash-head">
      <span className={`ps-section-icon is-${tone}`}><Icon name={icon} size={22}/></span>
      <div className="ps-dash-head-text">
        <h2>{title}</h2>
        {sub&&<p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

// One puzzle per row: date, title with its matchup, questions, status, Edit.
// On phones the columns fold into a two-line card.
function PuzzleTable({games, today, onEdit, quiet=false}){
  return(
    <div className={`ps-table${quiet?" is-quiet":""}`} role="table">
      <div className="ps-tr ps-th" role="row">
        <span role="columnheader">Date</span>
        <span role="columnheader">Puzzle</span>
        <span role="columnheader">Questions</span>
        <span role="columnheader">Status</span>
        <span role="columnheader"><span className="ps-sr">Action</span></span>
      </div>
      {games.map(g=>(
        <div className="ps-tr" role="row" key={g.id}>
          <span className="ps-td-date" role="cell">
            {g.date?formatAdminDate(g.date):"No date"}
            {!quiet&&g.date&&<small>{whenLabel(today, g.date)}</small>}
          </span>
          <span className="ps-td-title" role="cell">
            <strong>{g.themeTitle||"Untitled puzzle"}</strong>
            <small>{matchup(g)}</small>
          </span>
          <span className="ps-td-count" role="cell">{questionCount(g)}</span>
          <span className="ps-td-status" role="cell"><StatusBadge game={g} today={today}/></span>
          <span className="ps-td-action" role="cell">
            <button type="button" className="ps-btn ps-btn-sm" onClick={()=>onEdit(g)} aria-label={`Edit ${g.themeTitle||"untitled puzzle"}`}>Edit</button>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({games, today, onNew, onEdit, onLogout}){
  const {BrandIcon} = useStudio();
  const[query,setQuery]=useState("");
  const {drafts, upcoming, history, retired} = groupPuzzles(games, today);
  const published = upcoming.length + history.length;
  const shownHistory = history.filter(g=>matchesSearch(g, query, formatAdminDate));

  return(
    <div className="ps-shell">
      <header className="ps-topbar">
        <div className="ps-brand">
          <BrandIcon name="gear" size={34}/>
          <span>What The Fudge Admin</span>
        </div>
        <div className="ps-topbar-actions">
          <button type="button" className="ps-btn ps-btn-primary" onClick={onNew}><Icon name="plus" size={18}/>New Puzzle</button>
          <button type="button" className="ps-btn" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="ps-dash">
        <div className="ps-dash-stats" aria-label="Puzzle counts">
          <span className="ps-stat is-published"><Icon name="check" size={16}/>{published} published</span>
          <span className="ps-stat"><Icon name="doc" size={16}/>{drafts.length} draft{drafts.length===1?"":"s"}</span>
        </div>

        <section className="ps-panel ps-dash-section" aria-labelledby="ps-drafts-title">
          <SectionHead icon="doc" tone="yellow" title={<span id="ps-drafts-title">Drafts</span>} sub="Work-in-progress puzzles that aren't published yet."/>
          {drafts.length===0?(
            <div className="ps-empty">
              <span>No drafts right now.</span>
              <button type="button" className="ps-link-btn" onClick={onNew}>Start a new puzzle</button>
            </div>
          ):(
            <ul className="ps-draft-list">
              {drafts.map(g=>(
                <li key={g.id} className="ps-draft">
                  <div className="ps-draft-text">
                    <strong>{g.themeTitle||"Untitled puzzle"}</strong>
                    <span>{g.date?`${formatAdminDate(g.date)} · ${whenLabel(today, g.date)}`:"No date yet"} · {questionCount(g)} · {matchup(g)}</span>
                  </div>
                  <button type="button" className="ps-btn ps-btn-primary ps-btn-sm" onClick={()=>onEdit(g)} aria-label={`Continue editing ${g.themeTitle||"untitled puzzle"}`}>Continue editing</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ps-panel ps-dash-section" aria-labelledby="ps-upcoming-title">
          <SectionHead icon="calendar" tone="teal" title={<span id="ps-upcoming-title">Today &amp; upcoming</span>} sub="Published puzzles for today and the days ahead."/>
          {upcoming.length===0
            ? <div className="ps-empty"><span>Nothing is scheduled for today or later.</span></div>
            : <PuzzleTable games={upcoming} today={today} onEdit={onEdit}/>}
        </section>

        <section className="ps-panel ps-dash-section" aria-labelledby="ps-history-title">
          <SectionHead icon="star" tone="pink" title={<span id="ps-history-title">Published history</span>} sub="Puzzles that have already run.">
            {history.length>0&&(
              <label className="ps-search">
                <Icon name="search" size={18}/>
                <span className="ps-sr">Search published puzzles</span>
                <input type="search" value={query} placeholder="Search puzzles…" onChange={e=>setQuery(e.target.value)}/>
              </label>
            )}
          </SectionHead>
          {history.length===0
            ? <div className="ps-empty"><span>No past puzzles yet.</span></div>
            : shownHistory.length===0
              ? <div className="ps-empty"><span>No past puzzles match “{query.trim()}”.</span></div>
              : <PuzzleTable games={shownHistory} today={today} onEdit={onEdit} quiet/>}
        </section>

        {retired.length>0&&(
          <section className="ps-panel ps-dash-section" aria-labelledby="ps-retired-title">
            <SectionHead icon="doc" tone="yellow" title={<span id="ps-retired-title">Retired</span>} sub="Hidden from players. Kept because people played them; their dates are free again."/>
            <PuzzleTable games={retired} today={today} onEdit={onEdit} quiet/>
          </section>
        )}
      </main>
    </div>
  );
}
