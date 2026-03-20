# MLB Guessing Game - Implementation Plan

## Overview
A Wordle-style MLB player guessing game built with plain HTML/CSS/JS. The user guesses an MLB player and receives comparison clues (arrows, colors, letter hints) to narrow down the mystery player.

---

## Game Flow

1. User selects **mode**: Daily Puzzle or Practice (random)
2. User optionally filters player pool by **era** (e.g., all-time, 2000+, active only)
3. A mystery player is selected (deterministic for daily, random for practice)
4. User types a player name into a **search/autocomplete** input
5. On guess, a row appears showing:
   - **Player name** — with first/last letter highlighting if they match the mystery player
   - **Position** — exact match = green, same category (hitter vs pitcher) = yellow, mismatch = gray
   - **Debut season** — up/down arrow + color
   - **Teams count** — number of matching teams + up/down arrow for total team count
   - **Career stats** (category-specific, see below) — up/down arrows + color
6. Repeat until correct guess or user gives up
7. On correct guess: celebration + stats summary (guesses taken, share button)

---

## Data

### Source
User will provide CSV files. We'll need two CSVs:

- **hitters.csv** — expected columns (TBD from user's files):
  `name, debut_year, teams, position, games, at_bats, hits, home_runs, rbi, batting_avg, stolen_bases, all_star_appearances, ...`

- **pitchers.csv** — expected columns (TBD from user's files):
  `name, debut_year, teams, position, games, wins, losses, era, strikeouts, saves, whip, all_star_appearances, ...`

### Loading
- CSVs will be loaded at runtime via `fetch()` and parsed with a lightweight CSV parser (no dependencies — we'll write a simple one)
- Player pool filtering (by era) happens client-side after load

---

## Comparison Logic

### Arrows & Colors
| Field | Match | Close | No Match |
|-------|-------|-------|----------|
| Debut year | Green (exact) | Yellow (within 3 years) | Red + ↑/↓ arrow |
| Stats (HR, AVG, etc.) | Green (exact) | Yellow (within ~10%) | Red + ↑/↓ arrow |
| Position | Green (exact) | Yellow (same category) | Gray |
| Teams count | Green (same count) | — | ↑/↓ arrow |

- **↑ arrow**: mystery player's value is HIGHER than guessed player
- **↓ arrow**: mystery player's value is LOWER than guessed player

### Name Letter Hints
- If the guessed player's **first name initial** matches the mystery player's → highlight it (green border/background)
- If the guessed player's **last name initial** matches → highlight it
- Both can be highlighted independently

### Teams Overlap
- Display: `X/Y` where X = number of teams in common, Y = total teams of mystery player
- Arrow indicates whether the mystery player played for more or fewer total teams

---

## Modes

### Daily Puzzle
- Same player for everyone on a given date
- Deterministic selection: use date as seed for a simple hash to pick index into player array
- Streak tracking in localStorage

### Practice Mode
- Random player each time
- No streak tracking, but show result stats

---

## Project Structure

```
guesstheplayer/
├── index.html          # Single-page app
├── css/
│   └── style.css       # All styles (responsive, mobile-friendly)
├── js/
│   ├── app.js          # Main game controller
│   ├── data.js         # CSV loading, parsing, player pool management
│   ├── game.js         # Core game logic (comparison, arrows, scoring)
│   ├── ui.js           # DOM manipulation, rendering guess rows
│   └── autocomplete.js # Search-as-you-type component
├── data/
│   ├── hitters.csv     # Hitter data (user-provided)
│   └── pitchers.csv    # Pitcher data (user-provided)
└── PLAN.md
```

---

## UI Layout (Mobile-First)

```
┌─────────────────────────────────┐
│  ⚾ GUESS THE PLAYER            │
│  [Daily] [Practice]  [Era ▼]   │
├─────────────────────────────────┤
│  🔍 [Type a player name...   ]  │
│     ┌─ autocomplete dropdown ─┐ │
│     │ Mike Trout              │ │
│     │ Mike Piazza             │ │
│     └─────────────────────────┘ │
├─────────────────────────────────┤
│  GUESSES                        │
│ ┌───────────────────────────────┐
│ │ Name    │Pos│Debut│Teams│ Stats│
│ ├─────────┼───┼─────┼─────┼─────┤
│ │ M.Trout │CF │2011 │ 1/2 │ ... │
│ │  ↑green │grn│ ↑yel│  ↑  │     │
│ └───────────────────────────────┘
├─────────────────────────────────┤
│  [Give Up]                      │
└─────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Project scaffolding
1. Create directory structure and empty files
2. Build `index.html` with semantic markup
3. Set up `style.css` with CSS variables for theming/colors

### Phase 2: Data layer
4. Write CSV parser in `data.js`
5. Create sample/placeholder CSV data for development
6. Implement player pool loading and era filtering

### Phase 3: Core game logic
7. Implement comparison engine in `game.js` (arrows, colors, letter matching)
8. Implement daily puzzle seed-based selection
9. Implement practice mode random selection

### Phase 4: UI & Autocomplete
10. Build autocomplete search component
11. Build guess row rendering (arrows, colors, letter highlights)
12. Build game state UI (guess count, give up, celebration)

### Phase 5: Polish
13. Add localStorage persistence (daily streak, game state)
14. Mobile responsiveness
15. Share button (copy results grid like Wordle)
16. Add animations/transitions

---

## Key Decisions & Notes

- **No build tools / no dependencies** — pure HTML/CSS/JS, can be opened from file or served with any static server
- **Two player categories**: hitters and pitchers — stats displayed are category-specific
- **Responsive**: works on mobile and desktop
- **Accessible**: keyboard navigation for autocomplete, ARIA labels, color + icon indicators (not color alone)

---

## Open Items (Need from User)

1. **CSV files** from MLB-Matchups / Sports-Degrees repos — once provided, I'll adapt the column mappings
2. **Which specific stats** to show per category (I'll start with common ones and adjust)
3. **Era filter options** — what year ranges make sense? (Suggested: All-Time, 1960+, 1980+, 2000+, Active)
4. **Hosting preference** — GitHub Pages? Vercel? Local only for now?
