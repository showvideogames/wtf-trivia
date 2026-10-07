import { describe, expect, it } from "vitest";
import { TOPICS, foldText, normalizeTags, toggleTag, topicById, topicDisplay, topicLabels } from "./topics.js";

const APPROVED = [
  ["sports", "Sports 🏀"],
  ["music", "Music 🎵"],
  ["gaming", "Gaming 🎮"],
  ["geography", "Geography 🌎"],
  ["books", "Books 📖"],
  ["tv", "TV 📺"],
  ["movies", "Movies 🎬"],
  ["food", "Food 🍕"],
  ["theatre", "Theatre 🎭"],
  ["art", "Art 🎨"],
  ["history", "History 🏛️"],
  ["science", "Science 🔬"],
  ["animals", "Animals 🐶"],
  ["holidays", "Holidays 🎉"],
  ["comics", "Comics 🦸"],
  ["board_games", "Board Games 🎲"],
  ["words_language", "Words & Language 🔤"],
  ["space", "Space 🚀"],
  ["internet_memes", "Internet & Memes 🌐"],
  ["cars", "Cars 🚗"],
  ["toys", "Toys 🧸"],
  ["made-up", "Made Up 🙄"],
];

describe("topic definitions", () => {
  it("are exactly the approved ids and display labels, in order", () => {
    expect(TOPICS.map((t) => [t.id, topicDisplay(t)])).toEqual(APPROVED);
  });

  it("have unique ids and labels", () => {
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    expect(new Set(TOPICS.map((t) => t.label)).size).toBe(TOPICS.length);
  });

  it("look topics up by id", () => {
    expect(topicById("board_games").label).toBe("Board Games");
    expect(topicById("nope")).toBeNull();
  });
});

describe("normalizeTags", () => {
  it("keeps several tags on one puzzle, in the list order", () => {
    expect(normalizeTags(["toys", "music", "gaming"])).toEqual(["music", "gaming", "toys"]);
  });

  it("treats no tags as valid", () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it("treats a missing or malformed value (old puzzles) as no tags", () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags("music")).toEqual([]);
  });

  it("drops repeats and ids outside the approved list", () => {
    expect(normalizeTags(["music", "music", "Music", "made_up"])).toEqual(["music"]);
  });

  it("keeps Made Up under its stable id, after the older topics, without touching them", () => {
    expect(topicById("made-up")).toEqual({ id: "made-up", label: "Made Up", emoji: "🙄" });
    expect(normalizeTags(["made-up", "toys", "music"])).toEqual(["music", "toys", "made-up"]);
    // A selection saved before Made Up existed reads back exactly as saved.
    expect(normalizeTags(["sports", "board_games", "internet_memes"])).toEqual(["sports", "board_games", "internet_memes"]);
    expect(toggleTag(["music"], "made-up")).toEqual(["music", "made-up"]);
    expect(topicLabels(["made-up"])).toEqual(["Made Up"]);
  });

  it("has no maximum", () => {
    const all = TOPICS.map((t) => t.id);
    expect(normalizeTags([...all].reverse())).toEqual(all);
  });
});

describe("toggleTag", () => {
  it("adds a missing tag and removes a selected one", () => {
    const one = toggleTag([], "food");
    const two = toggleTag(one, "sports");
    expect(two).toEqual(["sports", "food"]);
    expect(toggleTag(two, "food")).toEqual(["sports"]);
    expect(toggleTag(undefined, "food")).toEqual(["food"]);
  });
});

describe("topicLabels", () => {
  it("returns display labels for the stored ids", () => {
    expect(topicLabels(["words_language", "tv"])).toEqual(["TV", "Words & Language"]);
    expect(topicLabels(undefined)).toEqual([]);
  });
});

describe("foldText", () => {
  it("removes accents and case through Unicode normalization", () => {
    expect(foldText("Pokémon")).toBe("pokemon");
    expect(foldText("POKÉMON")).toBe("pokemon");
    expect(foldText("Crème Brûlée")).toBe("creme brulee");
    expect(foldText("Ｆｕｌｌｗｉｄｔｈ")).toBe("fullwidth");
  });

  it("copes with missing values", () => {
    expect(foldText(undefined)).toBe("");
    expect(foldText(null)).toBe("");
  });
});
