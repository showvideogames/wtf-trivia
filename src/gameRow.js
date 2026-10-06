// Puzzle (app shape) <-> public.games row (database shape).
import { normalizeTags } from "./topics.js";

// Share names (the category labels in the copied Results text) live in two
// optional columns added by supabase/share_names.sql. They are only sent when
// the puzzle has one, or when it was loaded from a database that already has
// the columns (so clearing a name saves null). Until that migration runs,
// puzzles without share names keep saving exactly as before.
//
// Topic tags (supabase/puzzle_tags.sql) follow the same rule: `tags` is sent
// when the puzzle has any, or when its row came back with a tags column (so
// removing the last tag saves []). An untagged puzzle saves exactly as
// before on a database that hasn't run the migration yet.
//
// Category subtitles (supabase/category_subtitles.sql) are the optional
// second line under each name in the gameplay matchup banner ("Song").
// Same rule as share names: sent when the puzzle has one, or when its row
// came back with the columns (so clearing one saves null).
//
// Answer button names (supabase/category_display_names.sql) are the optional
// labels on the two answer-choice buttons; blank means "use the category
// name" (answerButtonName). Same rule again. None of these display names
// touch answers: a question's correctCategory is always "A" or "B".
function trimmedShareName(value){
  return typeof value==="string" && value.trim() ? value.trim() : null;
}
export function gameToRow(g){
  const shareA = trimmedShareName(g.categoryAShareName);
  const shareB = trimmedShareName(g.categoryBShareName);
  const subA = trimmedShareName(g.categoryASubtitle);
  const subB = trimmedShareName(g.categoryBSubtitle);
  const btnA = trimmedShareName(g.categoryAButtonName);
  const btnB = trimmedShareName(g.categoryBButtonName);
  const tags = normalizeTags(g.tags);
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
    ...(shareA||shareB||g.shareNameColumns ? {category_a_share_name:shareA, category_b_share_name:shareB} : {}),
    ...(subA||subB||g.subtitleColumns ? {category_a_subtitle:subA, category_b_subtitle:subB} : {}),
    ...(btnA||btnB||g.buttonNameColumns ? {category_a_button_name:btnA, category_b_button_name:btnB} : {}),
    ...(tags.length||g.tagsColumn ? {tags} : {})
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
    categoryASubtitle: r.category_a_subtitle||"",
    categoryBSubtitle: r.category_b_subtitle||"",
    subtitleColumns: "category_a_subtitle" in r,
    categoryAButtonName: r.category_a_button_name||"",
    categoryBButtonName: r.category_b_button_name||"",
    buttonNameColumns: "category_a_button_name" in r,
    tags: normalizeTags(r.tags),
    tagsColumn: "tags" in r,
    status: r.status,
    questions: r.questions||[]
  };
}
