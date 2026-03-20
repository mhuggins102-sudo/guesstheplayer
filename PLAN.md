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

### Source Repositories

**MLB-Matchups** (`mhuggins102-sudo/MLB-Matchups`):
- `2025_batting.csv` — 763 hitters, 2025 season stats
  - Columns: `Rk, Player, Age, Team, Lg, WAR, G, PA, AB, R, H, 2B, 3B, HR, RBI, SB, CS, BB, SO, BA, OBP, SLG, OPS, OPS+, rOBA, Rbat+, TB, GIDP, HBP, SH, SF, IBB, Pos, Awards, Player-additional`
- `2025_pitching.csv` — 719 pitchers, 2025 season stats
  - Columns: `Rk, Player, Age, Team, Lg, WAR, W, L, W-L%, ERA, G, GS, GF, CG, SHO, SV, IP, H, R, ER, HR, BB, IBB, SO, HBP, BK, WP, BF, ERA+, FIP, WHIP, H9, HR9, BB9, SO9, SO/BB, Awards, Player-additional`
- Lahman `People.csv` (~21K players) — biographical: `playerID, birthYear, nameFirst, nameLast, debut, finalGame, bats, throws`
- Lahman `Batting.csv` — season-by-season batting lines (~1,288 rows in this repo's subset)
- Lahman `Pitching.csv` — season-by-season pitching lines (~4,850 rows)
- `careerWAR_batting.csv` / `careerWAR_pitching.csv` — career WAR totals

**Sports-Degrees** (`mhuggins102-sudo/Sports-Degrees`):
- `lahman/People.csv` (~24K players) — same Lahman biographical data (more complete version)
- `lahman/Appearances.csv` (~105K rows) — games by position per season, useful for deriving primary position and teams played for
  - Columns: `yearID, teamID, lgID, playerID, G_all, GS, G_batting, G_defense, G_p, G_c, G_1b, G_2b, G_3b, G_ss, G_lf, G_cf, G_rf, G_of, G_dh, G_ph, G_pr`

### Data Strategy

We'll build a **Python preprocessing script** (`scripts/build_data.py`) that:

1. Reads the Lahman CSVs (People, Appearances, Batting, Pitching)
2. Aggregates season-by-season stats into **career totals**
3. Derives **primary position** from Appearances (position with most games)
4. Derives **teams list** from Appearances (unique teamIDs per player)
5. Outputs two clean JSON files for the game:

**`data/hitters.json`** — fields per player:
```
name, debut_year, final_year, teams[], position, games, hits, home_runs, rbi, batting_avg, stolen_bases, war
```

**`data/pitchers.json`** — fields per player:
```
name, debut_year, final_year, teams[], position, games, wins, losses, era, strikeouts, saves, war
```

### Why preprocess?
- The raw Lahman data is season-by-season; we need career aggregates
- Keeps the client-side code simple — just load JSON, no complex aggregation
- The build script can be re-run whenever new season data is added
- JSON is faster to parse than CSV in the browser

### Loading
- JSON files loaded at runtime via `fetch()`
- Player pool filtering (by era) happens client-side after load
- Total player count will be filtered to only "notable" players (e.g., minimum 500 PA for hitters, 200 IP for pitchers) to keep the game fun

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
├── index.html              # Single-page app
├── css/
│   └── style.css           # All styles (responsive, mobile-friendly)
├── js/
│   ├── app.js              # Main game controller
│   ├── data.js             # JSON loading, player pool management
│   ├── game.js             # Core game logic (comparison, arrows, scoring)
│   ├── ui.js               # DOM manipulation, rendering guess rows
│   └── autocomplete.js     # Search-as-you-type component
├── data/
│   ├── hitters.json        # Preprocessed hitter data
│   └── pitchers.json       # Preprocessed pitcher data
├── scripts/
│   └── build_data.py       # Preprocesses Lahman CSVs → game JSON
├── raw_data/               # (gitignored) Lahman CSV source files
│   ├── People.csv
│   ├── Appearances.csv
│   ├── Batting.csv
│   └── Pitching.csv
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
4. Write `scripts/build_data.py` to preprocess Lahman CSVs into game JSON
5. Download Lahman CSVs from the repos and generate `hitters.json` / `pitchers.json`
6. Write `data.js` to load JSON and implement player pool filtering by era

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

## Resolved Decisions

1. **Data source**: Lahman CSVs from MLB-Matchups + Sports-Degrees repos, preprocessed via Python script
2. **Stats displayed**:
   - Hitters: AVG, HR, RBI, H, SB, WAR
   - Pitchers: W, ERA, SO, SV, WHIP, WAR
3. **Era filters**: All-Time, 1960+, 1980+, 2000+, Active
4. **Hosting**: Cloudflare Workers & Pages (connected to GitHub)
