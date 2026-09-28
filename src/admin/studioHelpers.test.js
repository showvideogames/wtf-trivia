import { describe, expect, it } from "vitest";
import { groupPuzzles, matchesSearch } from "./dashboardGroups.js";
import { countReady, firstBlankItem, followMove, missingSummary, moveQuestion, questionGaps, questionKey } from "./questionStatus.js";
import { daysFrom, formatLongDate, parseAdminDate } from "./adminDates.js";

const isYT = url=>url.includes("youtu");

describe("groupPuzzles", ()=>{
  const games = [
    {id:"old", status:"published", date:"2026-09-01"},
    {id:"today", status:"published", date:"2026-09-28"},
    {id:"next", status:"published", date:"2026-10-02"},
    {id:"d1", status:"draft", date:"2026-10-05"},
    {id:"d0", status:"draft", date:""},
    {id:"d2", status:"draft", date:"2026-09-30"},
    {id:"older", status:"published", date:"2026-08-15"},
  ];
  it("uses real status and date", ()=>{
    const {drafts, upcoming, history} = groupPuzzles(games, "2026-09-28");
    expect(drafts.map(g=>g.id)).toEqual(["d2","d1","d0"]);
    expect(upcoming.map(g=>g.id)).toEqual(["today","next"]);
    expect(history.map(g=>g.id)).toEqual(["old","older"]);
  });
  it("never files an old draft as published history", ()=>{
    const {drafts, history} = groupPuzzles([{id:"x", status:"draft", date:"2020-01-01"}], "2026-09-28");
    expect(drafts).toHaveLength(1);
    expect(history).toHaveLength(0);
  });
});

describe("matchesSearch", ()=>{
  const g = {themeTitle:"Board Game OR Nicolas Cage Movie?", categoryA:"Board Game", categoryB:"Nicolas Cage Movie", date:"2026-09-25"};
  it("matches every word across title, categories and date", ()=>{
    expect(matchesSearch(g, "cage board")).toBe(true);
    expect(matchesSearch(g, "cage hockey")).toBe(false);
    expect(matchesSearch(g, "09/25", ()=>"09/25/2026")).toBe(true);
    expect(matchesSearch(g, "  ")).toBe(true);
  });
});

describe("question status", ()=>{
  it("lists missing authoring fields", ()=>{
    expect(questionGaps({itemText:"A", explanationCopy:"x", flavorCopy:"y"}, isYT)).toEqual([]);
    expect(questionGaps({itemText:" ", imageUrl:"https://e.com/a.png"}, isYT))
      .toEqual(["Item text","Actual Info","Needless Commentary","Alt text"]);
    expect(questionGaps({itemText:"A", explanationCopy:"x", flavorCopy:"y", imageUrl:"https://youtu.be/abc"}, isYT)).toEqual([]);
  });
  it("summarises only what is missing", ()=>{
    expect(missingSummary([])).toBe("Complete");
    expect(missingSummary(["Needless Commentary"])).toBe("Missing commentary");
    expect(missingSummary(["Actual Info","Needless Commentary"])).toBe("Missing explanation and commentary");
    expect(missingSummary(["Actual Info","Needless Commentary","Alt text"])).toBe("Missing explanation, commentary and alt text");
  });
  it("counts ready questions and finds blank items", ()=>{
    const qs = [{itemText:"A", explanationCopy:"x", flavorCopy:"y"}, {itemText:""}];
    expect(countReady(qs, isYT)).toBe(1);
    expect(firstBlankItem(qs)).toBe(1);
    expect(firstBlankItem(qs.slice(0,1))).toBe(-1);
  });
  it("keys questions by id, else position", ()=>{
    expect(questionKey({id:"q-1"}, 3)).toBe("q-1");
    expect(questionKey({}, 3)).toBe("idx-3");
  });
  it("moves a question, renumbers, and follows the selection", ()=>{
    const qs = [{itemText:"a"},{itemText:"b"},{itemText:"c"}];
    const moved = moveQuestion(qs, 0, 2);
    expect(moved.map(q=>q.itemText)).toEqual(["b","c","a"]);
    expect(moved.map(q=>q.orderIndex)).toEqual([1,2,3]);
    expect(moveQuestion(qs, 0, 5)).toBe(qs);
    expect(followMove(0, 0, 2)).toBe(2);
    expect(followMove(1, 0, 2)).toBe(0);
    expect(followMove(2, 0, 1)).toBe(2);
    expect(followMove(0, 2, 0)).toBe(1);
    expect(followMove("new", 0, 1)).toBe("new");
  });
});

describe("admin dates", ()=>{
  it("formats and compares local days", ()=>{
    expect(formatLongDate("2026-09-28")).toBe("September 28, 2026");
    expect(formatLongDate("")).toBe("");
    expect(parseAdminDate("9/28/2026")).toBe("2026-09-28");
    expect(daysFrom("2026-09-28","2026-10-01")).toBe(3);
    expect(daysFrom("2026-09-28","")).toBe(null);
  });
});
