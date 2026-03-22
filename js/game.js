/**
 * Core game logic: player selection, comparison engine, scoring.
 */
const Game = (() => {
  let mysteryPlayer = null;
  let guesses = [];
  let mode = 'daily'; // 'daily' or 'practice'
  let era = '2000';
  let difficulty = 'medium';
  let isOver = false;
  let isWon = false;
  let dailyInfo = null; // { type, difficulty, era } for daily mode
  let hintsGiven = [];
  let hintUsedThisGuess = false;

  // Stat key -> player data property
  const STAT_DATA_KEY = {
    avg: 'batting_avg', hr: 'home_runs', rbi: 'rbi', h: 'hits',
    sb: 'stolen_bases', bb: 'walks', ops: 'ops', xbh_pct: 'xbh_pct', war: 'war',
    w: 'wins', l: 'losses', era: 'era', so: 'strikeouts', sv: 'saves', whip: 'whip',
  };

  // Stat key -> column header name
  const STAT_TO_COL = {
    avg: 'AVG', hr: 'HR', rbi: 'RBI', h: 'H', sb: 'SB', bb: 'BB',
    ops: 'OPS', xbh_pct: 'XBH%', war: 'WAR',
    w: 'W', l: 'L', era: 'ERA', so: 'SO', sv: 'SV', whip: 'WHIP',
  };

  // Stat key -> decimal places for display
  const STAT_DECIMALS = {
    avg: 3, ops: 3, whip: 3, era: 2, xbh_pct: 1, war: 1,
  };

  // Simple seeded hash for daily puzzle
  function dateHash(dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
      hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function getDailyKey() {
    return `${era}-${difficulty}`;
  }

  function startGame(newMode, newEra, newDifficulty) {
    mode = newMode;
    era = newEra;
    difficulty = newDifficulty;
    guesses = [];
    isOver = false;
    isWon = false;
    mysteryPlayer = null;
    dailyInfo = null;
    hintsGiven = [];
    hintUsedThisGuess = false;

    if (mode === 'daily') {
      const today = new Date().toISOString().slice(0, 10);

      // Auto-determine type (75% hitter, 25% pitcher) and difficulty (75% easy, 25% medium)
      const typeSeed = dateHash(today + 'type');
      const dailyType = (typeSeed % 4) < 3 ? 'hitter' : 'pitcher';

      const diffSeed = dateHash(today + 'diff');
      difficulty = (diffSeed % 4) < 3 ? 'easy' : 'medium';

      const pool = DataManager.filterPool(era, difficulty).filter(p =>
        dailyType === 'hitter' ? DataManager.isHitter(p) : !DataManager.isHitter(p)
      );
      if (pool.length === 0) return { empty: true };

      const seed = dateHash(today + era);
      const index = seed % pool.length;
      mysteryPlayer = pool[index];
      dailyInfo = { type: dailyType, difficulty, era };
      return mysteryPlayer;
    }

    // Practice mode: defer selection until first guess
    const pool = DataManager.filterPool(era, difficulty);
    if (pool.length === 0) return { empty: true };
    return { deferred: true };
  }

  function pickPracticePlayer(isHitter) {
    const pool = DataManager.filterPool(era, difficulty).filter(p => {
      return isHitter ? DataManager.isHitter(p) : !DataManager.isHitter(p);
    });
    if (pool.length === 0) return null;
    const index = Math.floor(Math.random() * pool.length);
    mysteryPlayer = pool[index];
    return mysteryPlayer;
  }

  function makeGuess(player) {
    if (isOver) return null;

    // Practice mode: pick mystery player on first guess based on guessed type
    if (!mysteryPlayer) {
      const picked = pickPracticePlayer(DataManager.isHitter(player));
      if (!picked) return null;
    }

    hintUsedThisGuess = false;

    const result = compare(player, mysteryPlayer);
    guesses.push({ player, result });

    if (player.id === mysteryPlayer.id) {
      isOver = true;
      isWon = true;
    }

    return result;
  }

  function giveUp() {
    isOver = true;
    isWon = false;
    return mysteryPlayer;
  }

  function compare(guessed, target) {
    const result = {};
    const guessedIsHitter = DataManager.isHitter(guessed);
    const targetIsHitter = DataManager.isHitter(target);

    // Name letter matching
    const gFirst = guessed.name.split(' ')[0] || '';
    const gLast = guessed.name.split(' ').slice(1).join(' ') || '';
    const tFirst = target.name.split(' ')[0] || '';
    const tLast = target.name.split(' ').slice(1).join(' ') || '';

    result.name = {
      value: guessed.name,
      firstMatch: gFirst.charAt(0).toUpperCase() === tFirst.charAt(0).toUpperCase(),
      lastMatch: gLast.charAt(0).toUpperCase() === tLast.charAt(0).toUpperCase(),
    };

    // Position
    if (guessed.position === target.position) {
      result.position = { value: guessed.position, state: 'match' };
    } else if (guessedIsHitter === targetIsHitter) {
      result.position = { value: guessed.position, state: 'close' };
    } else {
      result.position = { value: guessed.position, state: 'neutral' };
    }

    // Debut year
    result.debut = compareNumeric(guessed.debut_year, target.debut_year, 3);

    // Teams
    const guessedTeams = new Set(guessed.teams);
    const targetTeams = new Set(target.teams);
    let overlap = 0;
    for (const t of guessedTeams) {
      if (targetTeams.has(t)) overlap++;
    }
    const teamCountDir = direction(guessedTeams.size, targetTeams.size);
    const teamsExact = guessedTeams.size === targetTeams.size && overlap === targetTeams.size;
    result.teams = {
      value: guessedTeams.size,
      overlap,
      direction: teamCountDir,
      state: teamsExact ? 'match' : overlap > 0 ? 'match' : 'miss',
      teamNames: guessed.teams,
    };

    // Stats — depends on whether target is hitter or pitcher
    if (targetIsHitter) {
      result.type = 'hitter';
      if (guessedIsHitter) {
        result.stats = {
          avg: compareNumeric(guessed.batting_avg, target.batting_avg, 0.01, 3),
          hr: compareNumeric(guessed.home_runs, target.home_runs, 30),
          rbi: compareNumeric(guessed.rbi, target.rbi, 100),
          h: compareNumeric(guessed.hits, target.hits, 150),
          sb: compareNumeric(guessed.stolen_bases, target.stolen_bases, 30),
          bb: compareNumeric(guessed.walks, target.walks, 80),
          ops: compareNumeric(guessed.ops, target.ops, 0.03, 3),
          xbh_pct: compareNumeric(guessed.xbh_pct, target.xbh_pct, 3, 1),
          war: compareNumeric(guessed.war, target.war, 5, 1),
        };
      } else {
        // Guessed a pitcher but target is hitter — show N/A for hitter stats
        result.stats = makeNAStats(['avg', 'hr', 'rbi', 'h', 'sb', 'bb', 'ops', 'xbh_pct', 'war']);
      }
    } else {
      result.type = 'pitcher';
      if (!guessedIsHitter) {
        result.stats = {
          w: compareNumeric(guessed.wins, target.wins, 15),
          l: compareNumeric(guessed.losses, target.losses, 15),
          era: compareNumeric(guessed.era, target.era, 0.3, 2, true), // lower is better
          so: compareNumeric(guessed.strikeouts, target.strikeouts, 200),
          sv: compareNumeric(guessed.saves, target.saves, 20),
          bb: compareNumeric(guessed.walks, target.walks, 80),
          whip: compareNumeric(guessed.whip, target.whip, 0.05, 3, true), // lower is better
          war: compareNumeric(guessed.war, target.war, 5, 1),
        };
      } else {
        result.stats = makeNAStats(['w', 'l', 'era', 'so', 'sv', 'bb', 'whip', 'war']);
      }
    }

    result.isCorrect = guessed.id === target.id;
    return result;
  }

  function compareNumeric(guessedVal, targetVal, closeThreshold, decimals, invertArrow) {
    decimals = decimals !== undefined ? decimals : 0;
    invertArrow = invertArrow || false;

    const gv = guessedVal || 0;
    const tv = targetVal || 0;
    const diff = Math.abs(gv - tv);

    let state;
    if (gv === tv || diff < 0.0001) {
      state = 'match';
    } else if (diff <= closeThreshold) {
      state = 'close';
    } else {
      state = 'miss';
    }

    // Arrow: does the target have a higher or lower value?
    let dir = direction(gv, tv);
    if (invertArrow && dir !== 'equal') {
      // For ERA/WHIP: if target is lower, that's "better" but we still show
      // directional arrows normally (target is lower = down arrow)
    }

    const displayVal = typeof gv === 'number' ? (decimals > 0 ? gv.toFixed(decimals) : gv) : gv;

    return { value: displayVal, state, direction: dir };
  }

  function direction(guessed, target) {
    if (guessed < target) return 'up';
    if (guessed > target) return 'down';
    return 'equal';
  }

  function makeNAStats(keys) {
    const stats = {};
    for (const key of keys) {
      stats[key] = { value: 'N/A', state: 'neutral', direction: 'equal' };
    }
    return stats;
  }

  function useHint() {
    if (!mysteryPlayer || isOver) return null;
    if (guesses.length < 4) return null;
    if (hintUsedThisGuess) return null;

    const hint = getNextHint();
    if (!hint) return null;

    hintsGiven.push(hint);
    hintUsedThisGuess = true;
    return hint;
  }

  function getNextHint() {
    // 1. Primary team
    if (!hintsGiven.some(h => h.type === 'team')) {
      return { type: 'team', text: 'Played majority of career with ' + mysteryPlayer.teams[0] };
    }

    // 2. First name initial (if not yet determined)
    const firstName = mysteryPlayer.name.split(' ')[0] || '';
    const firstInitial = firstName.charAt(0).toUpperCase();
    const firstKnown = guesses.some(g => g.result.name.firstMatch) ||
      hintsGiven.some(h => h.type === 'firstName');
    if (!firstKnown) {
      return { type: 'firstName', text: 'First name starts with "' + firstInitial + '"' };
    }

    // 3. Last name initial (if not yet determined)
    const lastName = mysteryPlayer.name.split(' ').slice(1).join(' ') || '';
    const lastInitial = lastName.charAt(0).toUpperCase();
    const lastKnown = guesses.some(g => g.result.name.lastMatch) ||
      hintsGiven.some(h => h.type === 'lastName');
    if (!lastKnown) {
      return { type: 'lastName', text: 'Last name starts with "' + lastInitial + '"' };
    }

    // 4. Undetermined stat
    const isHitter = DataManager.isHitter(mysteryPlayer);
    const statKeys = isHitter
      ? ['avg', 'hr', 'rbi', 'h', 'sb', 'bb', 'ops', 'xbh_pct', 'war']
      : ['w', 'l', 'era', 'so', 'sv', 'bb', 'whip', 'war'];

    for (const key of statKeys) {
      if (hintsGiven.some(h => h.type === 'stat' && h.key === key)) continue;
      const matched = guesses.some(g =>
        g.result.stats[key] && g.result.stats[key].state === 'match' && g.result.stats[key].direction === 'equal'
      );
      if (matched) continue;

      const val = mysteryPlayer[STAT_DATA_KEY[key]];
      const dec = STAT_DECIMALS[key];
      const displayVal = dec !== undefined ? val.toFixed(dec) : val;
      const colName = STAT_TO_COL[key];

      return { type: 'stat', key, colName, value: displayVal, text: 'Career ' + colName + ': ' + displayVal };
    }

    // 5. Debut year
    if (!hintsGiven.some(h => h.type === 'debut')) {
      const debMatched = guesses.some(g => g.result.debut.state === 'match');
      if (!debMatched) {
        return { type: 'debut', colName: 'Debut', value: mysteryPlayer.debut_year,
          text: 'Debuted in ' + mysteryPlayer.debut_year };
      }
    }

    return null;
  }

  function getState() {
    return { mysteryPlayer, guesses, mode, era, difficulty, isOver, isWon };
  }

  function getMysteryPlayer() {
    return mysteryPlayer;
  }

  function getDailyInfo() {
    return dailyInfo;
  }

  function getGuessCount() {
    return guesses.length;
  }

  function alreadyGuessed(playerId) {
    return guesses.some(g => g.player.id === playerId);
  }

  return { startGame, makeGuess, giveUp, useHint, getState, getMysteryPlayer, getDailyInfo, getGuessCount, alreadyGuessed, compare };
})();
