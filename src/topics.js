// Puzzle topic tags: the one list Admin and the Archive both read.
//
// The database stores the stable ids (public.games.tags, a text[]); the UI
// and Archive search use the labels. Ids never change once shipped, so a
// label can be reworded later without touching saved puzzles. The order here
// is the order topics are shown in.

export const TOPICS = [
  { id: "sports", label: "Sports", emoji: "🏀" },
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "geography", label: "Geography", emoji: "🌎" },
  { id: "books", label: "Books", emoji: "📖" },
  { id: "tv", label: "TV", emoji: "📺" },
  { id: "movies", label: "Movies", emoji: "🎬" },
  { id: "food", label: "Food", emoji: "🍕" },
  { id: "theatre", label: "Theatre", emoji: "🎭" },
  { id: "art", label: "Art", emoji: "🎨" },
  { id: "history", label: "History", emoji: "🏛️" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "animals", label: "Animals", emoji: "🐶" },
  { id: "holidays", label: "Holidays", emoji: "🎉" },
  { id: "comics", label: "Comics", emoji: "🦸" },
  { id: "board_games", label: "Board Games", emoji: "🎲" },
  { id: "words_language", label: "Words & Language", emoji: "🔤" },
  { id: "space", label: "Space", emoji: "🚀" },
  { id: "internet_memes", label: "Internet & Memes", emoji: "🌐" },
  { id: "cars", label: "Cars", emoji: "🚗" },
  { id: "toys", label: "Toys", emoji: "🧸" },
  { id: "made-up", label: "Made Up", emoji: "🙄" },
];

const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
const ORDER = new Map(TOPICS.map((t, i) => [t.id, i]));

export function topicById(id) {
  return BY_ID.get(id) || null;
}

// "Music 🎵"
export function topicDisplay(topic) {
  return `${topic.label} ${topic.emoji}`;
}

// A puzzle's tags as a clean list of known ids: missing or malformed values
// (old puzzles have no tags at all) become [], unknown ids and repeats are
// dropped, and the result follows the TOPICS order so saves are stable.
export function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const known = [...new Set(value.filter((id) => BY_ID.has(id)))];
  return known.sort((a, b) => ORDER.get(a) - ORDER.get(b));
}

// Adds the topic if it's missing, removes it if it's there.
export function toggleTag(tags, id) {
  const current = normalizeTags(tags);
  return current.includes(id) ? current.filter((t) => t !== id) : normalizeTags([...current, id]);
}

export function topicLabels(tags) {
  return normalizeTags(tags).map((id) => BY_ID.get(id).label);
}

// Text for matching: decomposed (NFKD) so accents become separate combining
// marks, the marks removed, then lower-cased. "Pokémon", "POKEMON" and
// "pokemon" all become "pokemon".
export function foldText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
