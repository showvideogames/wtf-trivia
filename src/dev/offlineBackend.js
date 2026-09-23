/* ============================================================
   DEV-ONLY offline backend.

   This module is used *only* when BOTH of these are true:
     - import.meta.env.DEV  (never true in a production build)
     - Supabase is not configured (no VITE_SUPABASE_URL / ANON_KEY)

   It exists so the player UI can be developed and reviewed locally
   without credentials. Vite strips it from production bundles, and
   as soon as real Supabase keys are present in .env the real data
   layer is used instead. It never talks to any database.
   ============================================================ */

const svg = (markup) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup.replace(/\s+/g, " ").trim())}`;

// Full-bleed square tiles: they read as an icon on the choice cards and still
// crop acceptably in the landing split, which is how real puzzle art behaves.
const DIE = /* @__PURE__ */ svg(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs><linearGradient id="d" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#3ddbd0"/><stop offset="1" stop-color="#0e8d88"/>
  </linearGradient></defs>
  <rect width="120" height="120" fill="url(#d)"/>
  <rect x="30" y="30" width="60" height="60" rx="15" fill="#ffffff"/>
  <g fill="#14505c">
    <circle cx="47" cy="47" r="5.6"/><circle cx="73" cy="47" r="5.6"/>
    <circle cx="47" cy="73" r="5.6"/><circle cx="73" cy="73" r="5.6"/>
    <circle cx="60" cy="60" r="5.6"/>
  </g>
</svg>`);

const CLAPPER = /* @__PURE__ */ svg(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f96b94"/><stop offset="1" stop-color="#c22b55"/>
  </linearGradient></defs>
  <rect width="120" height="120" fill="url(#c)"/>
  <rect x="28" y="58" width="64" height="34" rx="7" fill="#2b2b2b"/>
  <rect x="34" y="73" width="52" height="5" rx="2.5" fill="#efefef"/>
  <g transform="rotate(-11 60 48)">
    <rect x="28" y="36" width="64" height="18" rx="5" fill="#1a1a1a"/>
    <g fill="#ffffff">
      <rect x="33" y="37.5" width="9" height="15" transform="skewX(-14)"/>
      <rect x="52" y="37.5" width="9" height="15" transform="skewX(-14)"/>
      <rect x="71" y="37.5" width="9" height="15" transform="skewX(-14)"/>
    </g>
  </g>
</svg>`);

const photo = (a, b, label) =>
  svg(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
  </linearGradient></defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <circle cx="120" cy="90" r="52" fill="#ffffff" opacity="0.22"/>
  <circle cx="520" cy="280" r="78" fill="#ffffff" opacity="0.16"/>
  <text x="320" y="196" font-family="Trebuchet MS, sans-serif" font-size="40"
        font-weight="bold" fill="#ffffff" text-anchor="middle" opacity="0.92">${label}</text>
</svg>`);

// A deliberately tall still, so the reveal can be checked with media that is
// taller than it is wide (book covers, playing cards, posters).
const portrait = (a, b, label) =>
  svg(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 540">
  <defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
  </linearGradient></defs>
  <rect width="360" height="540" fill="url(#p)"/>
  <rect x="34" y="34" width="292" height="472" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.4"/>
  <circle cx="180" cy="210" r="66" fill="#ffffff" opacity="0.18"/>
  <text x="180" y="330" font-family="Trebuchet MS, sans-serif" font-size="34"
        font-weight="bold" fill="#ffffff" text-anchor="middle" opacity="0.94">${label}</text>
</svg>`);

const LONG_ITEM =
  "The Unbearably Long Title That Somehow Keeps Going Well Past The Point Of Reason";

const DEMO_QUESTIONS = [
  {
    itemText: "Through the Desert",
    correctCategory: "A",
    explanationCopy:
      "Through the Desert is a strategy board game about building colorful camel caravans across the desert.",
    flavorCopy: "To be fair, wandering through a desert does sound like a Nicolas Cage movie.",
    imageUrl: /* @__PURE__ */ photo("#e8b04b", "#c2571f", "Camels"),
    imageAlt: "Stylised desert artwork",
    imageSource: "Demo artwork",
  },
  {
    itemText: "Con Air",
    correctCategory: "B",
    explanationCopy:
      "Con Air is a 1997 action film in which Nicolas Cage protects a stuffed bunny at 30,000 feet.",
    flavorCopy: "Put the bunny back in the box.",
    imageUrl: "",
  },
  {
    itemText: "Tokaido",
    correctCategory: "A",
    explanationCopy:
      "Tokaido is a board game about walking slowly along an old Japanese road and enjoying the scenery.",
    flavorCopy: "The whole game is a vacation. There is no fighting. Genuinely relaxing.",
    imageUrl: /* @__PURE__ */ photo("#39b3a6", "#1c6f8c", "Tokaido"),
    imageAlt: "Stylised road artwork",
    imageSource: "Demo artwork",
  },
  {
    itemText: "Face/Off",
    correctCategory: "B",
    explanationCopy:
      "Face/Off is a 1997 film where Nicolas Cage and John Travolta surgically swap faces.",
    flavorCopy: "Medically unlikely. Cinematically essential.",
    imageUrl: "",
  },
  {
    itemText: LONG_ITEM,
    correctCategory: "A",
    explanationCopy:
      "This entry exists to prove that a very long prompt still wraps cleanly instead of being clipped, and that the layout keeps breathing even when an author goes well past a sensible number of characters. It should remain fully readable on a 390px phone screen without any horizontal scrolling whatsoever, no matter how enthusiastic the copywriter was feeling on the day.",
    flavorCopy:
      "And this is a deliberately long piece of needless commentary, included purely so that the second panel can be checked for wrapping too. It rambles. It continues. It refuses to stop. It is, in a sense, the needless commentary to end all needless commentary, and yet here it still is, going.",
    imageUrl: "",
  },
  {
    itemText: "Gone in 60 Seconds",
    correctCategory: "B",
    explanationCopy: "A 2000 remake in which Nicolas Cage steals fifty cars in one night.",
    flavorCopy: "Eleanor deserved better.",
    imageUrl: /* @__PURE__ */ photo("#8b5cf6", "#4c1d95", "60 Seconds"),
    imageAlt: "Stylised car artwork",
    imageSource: "Demo artwork",
  },
  {
    itemText: "Wingspan",
    correctCategory: "A",
    explanationCopy:
      "Wingspan is an award-winning board game about attracting birds to a series of wildlife preserves.",
    flavorCopy: "Beautiful art. Surprisingly cutthroat. Birds are not gentle people.",
    imageUrl: "",
  },
  {
    itemText: "The Wicker Man",
    correctCategory: "B",
    explanationCopy:
      "The Wicker Man is a 2006 remake featuring one of the most quoted Nicolas Cage scenes ever filmed.",
    flavorCopy: "Not the bees.",
    imageUrl: "",
  },
  // A YouTube reveal, so the embedded-player path can be reviewed locally.
  {
    itemText: "A New Hope",
    correctCategory: "B",
    explanationCopy:
      "Before it landed on Dude Ranch, this song circulated on an earlier demo tape under the title “Princess Leia”.",
    flavorCopy: "A pop-punk song or a guidance counsellor's pep talk. Genuinely hard to say.",
    imageUrl: "https://www.youtube.com/watch?v=OFbSKnKC4II",
    imageSource: "Official audio",
  },
  // A portrait still, to check that tall media is contained rather than cropped.
  {
    itemText: "Patchwork",
    correctCategory: "A",
    explanationCopy:
      "Patchwork is a two-player board game about stitching an oddly competitive quilt.",
    flavorCopy: "Never has fabric been this cut-throat.",
    imageUrl: /* @__PURE__ */ portrait("#2f4a7a", "#0f1d3a", "Patchwork"),
    imageAlt: "Stylised portrait cover artwork",
    imageSource: "Demo artwork",
  },
  {
    itemText: "Moonstruck",
    correctCategory: "B",
    explanationCopy: "Moonstruck is a 1987 romantic comedy starring Nicolas Cage opposite Cher.",
    flavorCopy: "Snap out of it.",
    imageUrl: "",
  },
  {
    itemText: "Azul",
    correctCategory: "A",
    explanationCopy:
      "Azul is a tile-laying board game about decorating the walls of a Portuguese palace.",
    flavorCopy: "The tiles are satisfying. The scoring is not.",
    imageUrl: /* @__PURE__ */ photo("#2aa1c4", "#134a6b", "Azul"),
    imageAlt: "Stylised tile artwork",
    imageSource: "Demo artwork",
  },
];

// A five-question archive puzzle, so a total that is not 12 can be checked.
//
// Built inside a function on purpose. A derived constant at module scope is a
// call the bundler cannot prove pure, which would pin this whole fixture into
// the production bundle even though nothing in production ever reads it.
function archiveQuestions() {
  return DEMO_QUESTIONS.slice(0, 5);
}

// A worst-case puzzle for the answer cards: both category names are long, so
// the label typography can be judged at its least forgiving. Also built inside
// a function, for the same tree-shaking reason as above.
function longLabelQuestions() {
  return [
    {
      itemText: "The Mountain Is You",
      correctCategory: "A",
      explanationCopy:
        "The Mountain Is You by Brianna Wiest is a real best-seller about turning self-sabotage into self-mastery.",
      flavorCopy: "The mountain is me. The mountain has always been me.",
      imageUrl: /* @__PURE__ */ portrait("#1b1b1b", "#3d3323", "The Mountain Is You"),
      imageAlt: "Stylised dark book cover",
      imageSource: "Demo artwork",
    },
    {
      itemText: "You Are the Lighthouse",
      correctCategory: "B",
      explanationCopy:
        "This title was invented for the quiz. There is no best-selling self-help book by this name.",
      flavorCopy: "Still waiting for the lighthouse to answer my emails.",
      imageUrl: /* @__PURE__ */ portrait("#16263f", "#0a1524", "You Are the Lighthouse"),
      imageAlt: "Stylised lighthouse book cover",
      imageSource: "Demo artwork",
    },
    {
      itemText: "Atomic Habits",
      correctCategory: "A",
      explanationCopy: "Atomic Habits by James Clear has sold many millions of copies worldwide.",
      flavorCopy: "One per cent better at buying books about being one per cent better.",
      imageUrl: "",
    },
    {
      itemText: "Unbothered by Tuesday",
      correctCategory: "B",
      explanationCopy: "Invented for the quiz. Tuesday remains, regrettably, quite bothering.",
      flavorCopy: "Wednesday was unavailable for comment.",
      imageUrl: "",
    },
    {
      itemText: "The Subtle Art of Not Giving a F*ck",
      correctCategory: "A",
      explanationCopy: "Mark Manson's 2016 book was a genuine global best-seller.",
      flavorCopy: "The irony of how much people cared about this one.",
      imageUrl: "",
    },
    {
      itemText: "Your Inner Weather Report",
      correctCategory: "B",
      explanationCopy: "Invented for the quiz. Forecast: made up, with a chance of made up.",
      flavorCopy: "Scattered feelings, clearing by the afternoon.",
      imageUrl: "",
    },
  ];
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export function demoGame() {
  return {
    id: "demo-today",
    date: todayKey(),
    themeTitle: "Board Game or Nicolas Cage Movie?",
    categoryA: "Board Game",
    categoryB: "Nicolas Cage Movie",
    categoryAColor: "teal",
    categoryBColor: "pink",
    categoryAImage: DIE,
    categoryBImage: CLAPPER,
    headerImage: "/src/dev/demo-hero.png",
    status: "published",
    questions: DEMO_QUESTIONS,
  };
}

function yesterdayKey() {
  return daysAgoKey(1);
}

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
}

export function demoGames() {
  const older = {
    ...demoGame(),
    id: "demo-yesterday",
    date: yesterdayKey(),
    themeTitle: "Yesterday's Demo Puzzle (5 questions)",
    questions: archiveQuestions(),
  };
  const longLabels = {
    ...demoGame(),
    id: "demo-long-labels",
    date: daysAgoKey(2),
    themeTitle: "Best-Selling Self-Help Book OR AI-Made-Up One?",
    categoryA: "Best-Selling Self-Help Book",
    categoryB: "AI-Made-Up Self-Help Book",
    categoryAImage: null,
    categoryBImage: null,
    questions: longLabelQuestions(),
  };
  return [demoGame(), older, longLabels];
}

/* ---------- localStorage-backed persistence (so refresh/resume works) ---------- */

const RECORD_KEY = "wtf-dev-records";
const STATS_KEY = "wtf-dev-stats";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const devPlayer = {
  id: "demo-player",
  email: null,
  isGuest: true,
  createdAt: new Date().toISOString(),
};

export function devGetRecord(date) {
  return readJSON(RECORD_KEY, {})[date] || null;
}

export function devInitRecord(date, themeTitle, total) {
  const all = readJSON(RECORD_KEY, {});
  if (all[date]) return all[date];
  all[date] = {
    date,
    themeTitle,
    score: 0,
    totalQuestions: total,
    currentIndex: 0,
    answers: [],
    completed: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  writeJSON(RECORD_KEY, all);
  return all[date];
}

export function devRecordAnswer(date, answers, score) {
  const all = readJSON(RECORD_KEY, {});
  if (!all[date]) return;
  all[date] = { ...all[date], answers, score, currentIndex: answers.length };
  writeJSON(RECORD_KEY, all);
}

export function devCompleteGame(date, answers, score, totalQuestions) {
  const all = readJSON(RECORD_KEY, {});
  all[date] = {
    ...(all[date] || { date, themeTitle: "Demo", startedAt: new Date().toISOString() }),
    answers,
    score,
    totalQuestions,
    currentIndex: answers.length,
    completed: true,
    completedAt: new Date().toISOString(),
  };
  writeJSON(RECORD_KEY, all);
  const stats = readJSON(STATS_KEY, {
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedDate: null,
    totalPlayed: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    bestCombo: 0,
  });
  if (stats.lastPlayedDate !== date) {
    stats.currentStreak += 1;
    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
    stats.lastPlayedDate = date;
    stats.totalPlayed += 1;
    stats.totalCorrect += score;
    stats.totalQuestions += totalQuestions;
  }
  writeJSON(STATS_KEY, stats);
}

export function devGetStats() {
  return readJSON(STATS_KEY, {
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedDate: null,
    totalPlayed: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    bestCombo: 0,
  });
}

export function devCommunityStats(date, userScore) {
  // Fixed demo figures so the "How everyone did" panel can be reviewed.
  return {
    finishedPlayers: 142,
    averageScore: 5,
    beatRate: Math.min(99, Math.max(3, Math.round((userScore / 8) * 92))),
    perfectRate: 11,
    questionAccuracies: [],
  };
}

export function devReset() {
  try {
    localStorage.removeItem(RECORD_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch {
    /* ignore */
  }
}
