// Splits the Admin's puzzle list into the dashboard's sections using only
// each puzzle's stored status and date.
//   drafts:   not published or retired, soonest date first, undated last
//   upcoming: published for today or later, soonest first
//   history:  published before today, newest first
//   retired:  hidden from players (kept because it has plays), newest first
export function groupPuzzles(games, today){
  const drafts = [];
  const upcoming = [];
  const history = [];
  const retired = [];
  for(const g of games||[]){
    if(g?.status==="retired") retired.push(g);
    else if(g?.status!=="published") drafts.push(g);
    else if((g.date||"")>=today) upcoming.push(g);
    else history.push(g);
  }
  const asc = (a,b)=>(a.date||"9999").localeCompare(b.date||"9999");
  const desc = (a,b)=>(b.date||"").localeCompare(a.date||"");
  drafts.sort(asc);
  upcoming.sort(asc);
  history.sort(desc);
  retired.sort(desc);
  return {drafts, upcoming, history, retired};
}

// The other puzzle already holding this puzzle's date, or null. Retired
// puzzles hold no date. (The database only refuses two PUBLISHED puzzles on
// one day; Admin keeps drafts apart too, as before.)
export function findDateConflict(games, game){
  if(!game?.date) return null;
  return (games||[]).find(g=>g && g.id!==game.id && g.status!=="retired" && g.date===game.date) || null;
}

// Client-side filter for Published history: every word must appear in the
// title, a category name or the date (as stored or as MM/DD/YYYY).
export function matchesSearch(game, query, formatDate=d=>d){
  const words = String(query||"").toLowerCase().split(/\s+/).filter(Boolean);
  if(!words.length) return true;
  const hay = [game?.themeTitle, game?.categoryA, game?.categoryB, game?.date, formatDate(game?.date||"")]
    .filter(Boolean).join(" ").toLowerCase();
  return words.every(w=>hay.includes(w));
}
