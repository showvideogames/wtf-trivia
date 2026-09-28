// Splits the Admin's puzzle list into the dashboard's three sections using
// only each puzzle's stored status and date.
//   drafts:   anything not published, soonest date first, undated last
//   upcoming: published for today or later, soonest first
//   history:  published before today, newest first
export function groupPuzzles(games, today){
  const drafts = [];
  const upcoming = [];
  const history = [];
  for(const g of games||[]){
    if(g?.status!=="published") drafts.push(g);
    else if((g.date||"")>=today) upcoming.push(g);
    else history.push(g);
  }
  const asc = (a,b)=>(a.date||"9999").localeCompare(b.date||"9999");
  drafts.sort(asc);
  upcoming.sort(asc);
  history.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  return {drafts, upcoming, history};
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
