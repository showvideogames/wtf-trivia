// Puzzle (app shape) <-> public.games row (database shape).
//
// Share names (the category labels in the copied Results text) live in two
// optional columns added by supabase/share_names.sql. They are only sent when
// the puzzle has one, or when it was loaded from a database that already has
// the columns (so clearing a name saves null). Until that migration runs,
// puzzles without share names keep saving exactly as before.
function trimmedShareName(value){
  return typeof value==="string" && value.trim() ? value.trim() : null;
}
export function gameToRow(g){
  const shareA = trimmedShareName(g.categoryAShareName);
  const shareB = trimmedShareName(g.categoryBShareName);
  return {
    id: g.id,
    date: g.date,
    theme_title: g.themeTitle,
    category_a: g.categoryA,
    category_b: g.categoryB,
    category_a_color: g.categoryAColor||null,
    category_b_color: g.categoryBColor||null,
    category_a_image: g.categoryAImage||null,
    category_b_image: g.categoryBImage||null,
    header_image: g.headerImage||null,
    status: g.status,
    questions: g.questions||[],
    ...(shareA||shareB||g.shareNameColumns ? {category_a_share_name:shareA, category_b_share_name:shareB} : {})
  };
}
export function rowToGame(r){
  return {
    id: r.id,
    date: r.date,
    themeTitle: r.theme_title,
    categoryA: r.category_a,
    categoryB: r.category_b,
    categoryAColor: r.category_a_color,
    categoryBColor: r.category_b_color,
    categoryAImage: r.category_a_image,
    categoryBImage: r.category_b_image,
    headerImage: r.header_image,
    categoryAShareName: r.category_a_share_name||"",
    categoryBShareName: r.category_b_share_name||"",
    shareNameColumns: "category_a_share_name" in r,
    status: r.status,
    questions: r.questions||[]
  };
}

