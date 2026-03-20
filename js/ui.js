/**
 * UI rendering: guess rows, result panel, grid layout.
 */
const UI = (() => {
  const HITTER_COLS = ['Name', 'Pos', 'Debut', 'Teams', 'AVG', 'HR', 'RBI', 'H', 'SB', 'BB', 'OPS', 'XBH%', 'WAR'];
  const PITCHER_COLS = ['Name', 'Pos', 'Debut', 'Teams', 'W', 'L', 'ERA', 'SO', 'SV', 'BB', 'WHIP', 'WAR'];

  const HITTER_STAT_KEYS = ['avg', 'hr', 'rbi', 'h', 'sb', 'bb', 'ops', 'xbh_pct', 'war'];
  const PITCHER_STAT_KEYS = ['w', 'l', 'era', 'so', 'sv', 'bb', 'whip', 'war'];

  let headerEl, rowsEl, resultEl, resultTitle, resultAnswer, resultStats;
  let giveUpBtn, newGameBtn, shareBtn;
  let currentType = null; // 'hitter' or 'pitcher' — set once mystery player is known

  function init() {
    headerEl = document.getElementById('guesses-header');
    rowsEl = document.getElementById('guesses-rows');
    resultEl = document.getElementById('result-panel');
    resultTitle = document.getElementById('result-title');
    resultAnswer = document.getElementById('result-answer');
    resultStats = document.getElementById('result-stats');
    giveUpBtn = document.getElementById('give-up-btn');
    newGameBtn = document.getElementById('new-game-btn');
    shareBtn = document.getElementById('share-btn');
  }

  function setupGrid(mysteryPlayer) {
    currentType = DataManager.isHitter(mysteryPlayer) ? 'hitter' : 'pitcher';
    const cols = currentType === 'hitter' ? HITTER_COLS : PITCHER_COLS;

    // Set grid template: name gets more space
    const colTemplate = `minmax(100px, 1.5fr) ${cols.slice(1).map(() => 'minmax(45px, 1fr)').join(' ')}`;
    document.documentElement.style.setProperty('--grid-cols', colTemplate);

    headerEl.innerHTML = '';
    for (const col of cols) {
      const cell = document.createElement('div');
      cell.textContent = col;
      cell.style.textAlign = 'center';
      headerEl.appendChild(cell);
    }
  }

  function renderGuess(result) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    // Name cell
    row.appendChild(buildNameCell(result.name));

    // Position cell
    row.appendChild(buildCell(result.position.value, result.position.state));

    // Debut cell
    row.appendChild(buildStatCell(result.debut));

    // Teams cell
    row.appendChild(buildTeamsCell(result.teams));

    // Stat cells
    const statKeys = currentType === 'hitter' ? HITTER_STAT_KEYS : PITCHER_STAT_KEYS;
    for (const key of statKeys) {
      row.appendChild(buildStatCell(result.stats[key]));
    }

    if (result.isCorrect) {
      row.querySelectorAll('.guess-cell').forEach(c => {
        c.className = 'guess-cell guess-cell--match';
      });
    }

    rowsEl.appendChild(row);
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function buildNameCell(nameData) {
    const cell = document.createElement('div');
    cell.className = 'guess-cell guess-cell--name';

    const parts = nameData.value.split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    const firstSpan = document.createElement('span');
    firstSpan.textContent = firstName;
    if (nameData.firstMatch) firstSpan.classList.add('name-letter--match');

    const lastSpan = document.createElement('span');
    lastSpan.textContent = lastName;
    if (nameData.lastMatch) lastSpan.classList.add('name-letter--match');

    cell.appendChild(firstSpan);
    cell.appendChild(document.createTextNode(' '));
    cell.appendChild(lastSpan);
    return cell;
  }

  function buildCell(value, state) {
    const cell = document.createElement('div');
    cell.className = `guess-cell guess-cell--${state}`;
    const valEl = document.createElement('span');
    valEl.className = 'guess-cell__value';
    valEl.textContent = value;
    cell.appendChild(valEl);
    return cell;
  }

  function buildStatCell(stat) {
    const cell = document.createElement('div');
    cell.className = `guess-cell guess-cell--${stat.state}`;

    const valEl = document.createElement('span');
    valEl.className = 'guess-cell__value';
    valEl.textContent = stat.value;
    cell.appendChild(valEl);

    if (stat.direction && stat.direction !== 'equal') {
      const arrow = document.createElement('span');
      arrow.className = 'guess-cell__arrow';
      arrow.textContent = stat.direction === 'up' ? '\u2191' : '\u2193';
      arrow.setAttribute('aria-label', stat.direction === 'up' ? 'Higher' : 'Lower');
      cell.appendChild(arrow);
    }

    return cell;
  }

  function buildTeamsCell(teams) {
    const cell = document.createElement('div');
    cell.className = `guess-cell guess-cell--${teams.state}`;

    const valEl = document.createElement('span');
    valEl.className = 'guess-cell__value';
    valEl.textContent = `${teams.overlap}/${teams.targetCount}`;
    cell.appendChild(valEl);

    if (teams.direction !== 'equal') {
      const arrow = document.createElement('span');
      arrow.className = 'guess-cell__arrow';
      arrow.textContent = teams.direction === 'up' ? '\u2191' : '\u2193';
      cell.appendChild(arrow);
    }

    return cell;
  }

  function clearGuesses() {
    rowsEl.innerHTML = '';
    headerEl.innerHTML = '';
  }

  function showResult(won, player, guessCount) {
    resultEl.classList.remove('hidden');
    resultEl.classList.toggle('result--win', won);

    resultTitle.textContent = won ? 'You got it!' : 'Game Over';
    resultAnswer.textContent = player.name;
    resultStats.textContent = won
      ? `Solved in ${guessCount} guess${guessCount !== 1 ? 'es' : ''}`
      : `The answer was ${player.name}`;

    giveUpBtn.classList.add('hidden');
    newGameBtn.classList.remove('hidden');
  }

  function hideResult() {
    resultEl.classList.add('hidden');
    resultEl.classList.remove('result--win');
    giveUpBtn.classList.remove('hidden');
    newGameBtn.classList.add('hidden');
  }

  function generateShareText(state) {
    const guesses = state.guesses;
    const lines = [`Guess The Player - MLB`];
    lines.push(`${state.mode === 'daily' ? 'Daily' : 'Practice'} | ${state.era} | ${state.difficulty}`);

    if (state.isWon) {
      lines.push(`Solved in ${guesses.length} guess${guesses.length !== 1 ? 'es' : ''}`);
    } else {
      lines.push(`Gave up after ${guesses.length} guess${guesses.length !== 1 ? 'es' : ''}`);
    }

    lines.push('');
    for (const g of guesses) {
      const r = g.result;
      let row = '';
      // Name
      row += r.isCorrect ? '\u2b50' : '\u2b1b';
      // Position
      row += stateEmoji(r.position.state);
      // Debut
      row += stateEmoji(r.debut.state);
      // Teams
      row += stateEmoji(r.teams.state);
      // Stats
      const statKeys = currentType === 'hitter' ? HITTER_STAT_KEYS : PITCHER_STAT_KEYS;
      for (const key of statKeys) {
        row += stateEmoji(r.stats[key].state);
      }
      lines.push(row);
    }

    return lines.join('\n');
  }

  function stateEmoji(state) {
    switch (state) {
      case 'match': return '\ud83d\udfe9';
      case 'close': return '\ud83d\udfe8';
      case 'miss': return '\ud83d\udfe5';
      default: return '\u2b1c';
    }
  }

  return { init, setupGrid, renderGuess, clearGuesses, showResult, hideResult, generateShareText };
})();
