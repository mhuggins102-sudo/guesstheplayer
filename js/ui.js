/**
 * UI rendering: guess rows, result panel, grid layout, popups.
 */
const UI = (() => {
  const HITTER_COLS = ['Name', 'Pos', 'Debut', 'Teams', 'AVG', 'HR', 'RBI', 'H', 'SB', 'BB', 'OPS', 'XBH%', 'WAR'];
  const PITCHER_COLS = ['Name', 'Debut', 'Teams', 'W', 'L', 'ERA', 'SO', 'SV', 'BB', 'WHIP', 'WAR'];

  const HITTER_STAT_KEYS = ['avg', 'hr', 'rbi', 'h', 'sb', 'bb', 'ops', 'xbh_pct', 'war'];
  const PITCHER_STAT_KEYS = ['w', 'l', 'era', 'so', 'sv', 'bb', 'whip', 'war'];

  const STAT_LABELS = {
    'Pos': 'Position', 'Debut': 'Debut Year', 'Teams': 'Teams',
    'AVG': 'Career AVG', 'HR': 'Career HR', 'RBI': 'Career RBI',
    'H': 'Career Hits', 'SB': 'Career SB', 'BB': 'Career BB',
    'OPS': 'Career OPS', 'XBH%': 'Career XBH%', 'WAR': 'Career WAR',
    'W': 'Career Wins', 'L': 'Career Losses', 'ERA': 'Career ERA',
    'SO': 'Career SO', 'SV': 'Career SV', 'WHIP': 'Career WHIP',
  };

  // Maps column header name -> stat key in result object
  const COL_TO_STAT_KEY = {
    'AVG': 'avg', 'HR': 'hr', 'RBI': 'rbi', 'H': 'h', 'SB': 'sb',
    'BB': 'bb', 'OPS': 'ops', 'XBH%': 'xbh_pct', 'WAR': 'war',
    'W': 'w', 'L': 'l', 'ERA': 'era', 'SO': 'so', 'SV': 'sv',
    'WHIP': 'whip',
  };

  // Yellow ("close") thresholds per stat key – must match game.js compareNumeric calls
  const CLOSE_THRESHOLDS = {
    avg: 0.01, hr: 30, rbi: 100, h: 150, sb: 30, bb: 80,
    ops: 0.03, xbh_pct: 3, war: 5,
    w: 15, l: 15, era: 0.3, so: 200, sv: 20, whip: 0.05,
    debut: 3,
  };

  // Decimal places for display rounding per stat key – must match game.js
  const STAT_DECIMALS = {
    avg: 3, ops: 3, xbh_pct: 1, war: 1,
    era: 2, whip: 3,
  };

  const ERA_LABELS = {
    'all': 'All-Time', '1940': '1940+', '1960': '1960+', '1980': '1980+',
    '2000': '2000+', 'active': 'Active',
  };

  let headerEl, rowsEl, resultEl, resultTitle, resultAnswer, resultStats;
  let giveUpBtn, newGameBtn, shareBtn;
  let popupEl;
  let playerCardModal, playerCardBody, playerCardClose;
  let currentType = null;
  let revealedValues = {}; // colName -> display value (from hints)
  const canHover = window.matchMedia('(hover: hover)').matches;
  let hoverAnchor = null; // track which element triggered a hover popup
  let cardHoverTimer = null; // delay timer for player card hover dismiss

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

    playerCardModal = document.getElementById('player-card-modal');
    playerCardBody = document.getElementById('player-card-body');
    playerCardClose = document.getElementById('player-card-close');
    if (playerCardClose) {
      playerCardClose.addEventListener('click', () => playerCardModal.classList.add('hidden'));
    }
    if (playerCardModal) {
      playerCardModal.addEventListener('click', (e) => {
        if (e.target === playerCardModal) playerCardModal.classList.add('hidden');
      });
      if (canHover) {
        // Keep card open while hovering over the modal content
        playerCardModal.querySelector('.player-card').addEventListener('mouseenter', () => {
          clearTimeout(cardHoverTimer);
        });
        // Dismiss when leaving the modal content area (onto the overlay)
        playerCardModal.querySelector('.player-card').addEventListener('mouseleave', () => {
          cardHoverTimer = setTimeout(() => playerCardModal.classList.add('hidden'), 150);
        });
      }
    }

    // Create reusable popup element
    popupEl = document.createElement('div');
    popupEl.className = 'popup hidden';
    document.body.appendChild(popupEl);

    // Dismiss popup on click outside (touch/mobile)
    document.addEventListener('click', (e) => {
      if (!popupEl.contains(e.target) && !e.target.closest('[data-popup]')) {
        hidePopup();
      }
    });

    // Keep popup visible while hovering over the popup itself on desktop
    if (canHover) {
      popupEl.addEventListener('mouseenter', () => { hoverAnchor = popupEl; });
      popupEl.addEventListener('mouseleave', () => { hoverAnchor = null; hidePopup(); });
    }
  }

  // -- Popup helpers --

  function showPopup(anchorEl, html) {
    popupEl.innerHTML = html;
    popupEl.classList.remove('hidden');

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    const popupW = popupEl.offsetWidth;
    let left = rect.left + rect.width / 2 - popupW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));
    let top = rect.bottom + 6;
    if (top + popupEl.offsetHeight > window.innerHeight - 8) {
      top = rect.top - popupEl.offsetHeight - 6;
    }
    popupEl.style.left = left + 'px';
    popupEl.style.top = top + 'px';
  }

  function hidePopup() {
    popupEl.classList.add('hidden');
    hoverAnchor = null;
  }

  function revealStat(colName, value) {
    revealedValues[colName] = value;
  }

  // -- Grid setup --

  function setupGrid(mysteryPlayer) {
    currentType = DataManager.isHitter(mysteryPlayer) ? 'hitter' : 'pitcher';
    const cols = currentType === 'hitter' ? HITTER_COLS : PITCHER_COLS;

    const colTemplate = `minmax(100px, 1.5fr) ${cols.slice(1).map(() => 'minmax(45px, 1fr)').join(' ')}`;
    document.documentElement.style.setProperty('--grid-cols', colTemplate);

    headerEl.innerHTML = '';
    for (const col of cols) {
      const cell = document.createElement('div');
      cell.textContent = col;
      cell.style.textAlign = 'center';

      // Stat headers show range info
      if (col !== 'Name') {
        cell.setAttribute('data-popup', col);
        cell.style.cursor = 'pointer';
        if (canHover) {
          cell.addEventListener('mouseenter', () => {
            hoverAnchor = cell;
            onHeaderClick(col, cell);
          });
          cell.addEventListener('mouseleave', () => {
            setTimeout(() => { if (hoverAnchor !== popupEl) hidePopup(); }, 50);
          });
        } else {
          cell.addEventListener('click', (e) => {
            e.stopPropagation();
            onHeaderClick(col, cell);
          });
        }
      }

      headerEl.appendChild(cell);
    }
  }

  // -- Header click: stat range popup --

  function onHeaderClick(colName, anchorEl) {
    const state = Game.getState();
    const guesses = state.guesses;

    if (colName === 'Pos') {
      // Show all guessed positions and their states
      const positions = guesses
        .map(g => ({ pos: g.result.position.value, state: g.result.position.state }))
        .filter(p => p.pos !== 'N/A');
      if (positions.length === 0) {
        showPopup(anchorEl, '<div class="popup__title">Position</div><div class="popup__body">No guesses yet</div>');
        return;
      }
      const lines = positions.map(p => {
        const icon = p.state === 'match' ? '=' : p.state === 'close' ? '~' : 'x';
        return icon + ' ' + p.pos;
      });
      const unique = [...new Set(lines)];
      showPopup(anchorEl, '<div class="popup__title">Position</div><div class="popup__body">' + unique.join('<br>') + '</div>');
      return;
    }

    // Check if value was revealed by a hint
    if (revealedValues[colName] !== undefined) {
      const label = STAT_LABELS[colName] || colName;
      showPopup(anchorEl, '<div class="popup__title">' + label + '</div><div class="popup__body">Exactly <strong>' + revealedValues[colName] + '</strong></div>');
      return;
    }

    if (colName === 'Teams') {
      const range = computeRange(guesses, g => g.result.teams, g => g.result.teams.value);
      showPopup(anchorEl, '<div class="popup__title">Number of Teams</div><div class="popup__body">' + formatRange(range) + '</div>');
      return;
    }

    if (colName === 'Debut') {
      const range = computeRange(guesses, g => g.result.debut, g => parseFloat(g.result.debut.value), CLOSE_THRESHOLDS.debut, 0);
      showPopup(anchorEl, '<div class="popup__title">Debut Year</div><div class="popup__body">' + formatRange(range, true) + '</div>');
      return;
    }

    // Stat columns
    const statKey = COL_TO_STAT_KEY[colName];
    if (!statKey) return;

    const label = STAT_LABELS[colName] || colName;
    const range = computeRange(
      guesses,
      g => g.result.stats[statKey],
      g => {
        const s = g.result.stats[statKey];
        return s && s.value !== 'N/A' ? parseFloat(s.value) : null;
      },
      CLOSE_THRESHOLDS[statKey],
      STAT_DECIMALS[statKey]
    );
    showPopup(anchorEl, '<div class="popup__title">' + label + '</div><div class="popup__body">' + formatRange(range) + '</div>');
  }

  function computeRange(guesses, getStat, getVal, threshold, decimals) {
    let lower = null, upper = null, exact = null;

    function round(v) {
      if (decimals === undefined || decimals === null) return v;
      var factor = Math.pow(10, decimals);
      return Math.round(v * factor) / factor;
    }

    for (const g of guesses) {
      const stat = getStat(g);
      if (!stat || stat.value === 'N/A') continue;
      const val = getVal(g);
      if (val === null || isNaN(val)) continue;

      if (stat.state === 'match' && stat.direction === 'equal') {
        exact = val;
      } else if (stat.direction === 'up') {
        // Mystery player's value is higher than guessed value
        lower = lower !== null ? Math.max(lower, val) : val;
        if (stat.state === 'close' && threshold) {
          var yellowUpper = round(val + threshold);
          upper = upper !== null ? Math.min(upper, yellowUpper) : yellowUpper;
        }
      } else if (stat.direction === 'down') {
        // Mystery player's value is lower than guessed value
        upper = upper !== null ? Math.min(upper, val) : val;
        if (stat.state === 'close' && threshold) {
          var yellowLower = round(val - threshold);
          lower = lower !== null ? Math.max(lower, yellowLower) : yellowLower;
        }
      }
    }

    return { lower, upper, exact };
  }

  function formatRange(range, isYear) {
    if (range.exact !== null) return 'Exactly <strong>' + range.exact + '</strong>';
    var lowerLabel = isYear ? 'After' : 'More than';
    var upperLabel = isYear ? 'Before' : 'Less than';
    if (range.lower !== null && range.upper !== null) {
      return 'Between <strong>' + range.lower + '</strong> and <strong>' + range.upper + '</strong>';
    }
    if (range.lower !== null) return lowerLabel + ' <strong>' + range.lower + '</strong>';
    if (range.upper !== null) return upperLabel + ' <strong>' + range.upper + '</strong>';
    return 'No data yet';
  }

  // -- Player card --

  function showPlayerCard(player) {
    if (!playerCardModal || !playerCardBody) return;

    const isHitter = DataManager.isHitter(player);
    const years = player.debut_year + '–' + (player.final_year || 'Present');
    const bbrefUrl = 'https://www.baseball-reference.com/players/' +
      player.bbref_id.charAt(0) + '/' + player.bbref_id + '.shtml';

    let statsHtml = '';
    if (isHitter) {
      const stats = [
        { label: 'WAR', val: player.war },
        { label: 'BA', val: player.batting_avg.toFixed(3) },
        { label: 'OPS', val: player.ops.toFixed(3) },
        { label: 'HR', val: player.home_runs },
        { label: 'RBI', val: player.rbi },
        { label: 'SB', val: player.stolen_bases },
        { label: 'XBH%', val: player.xbh_pct.toFixed(1) + '%' },
        { label: 'H', val: player.hits },
        { label: 'BB', val: player.walks },
      ];
      for (const s of stats) {
        statsHtml += '<div class="player-card__stat"><span class="player-card__stat-val">' +
          s.val + '</span><span class="player-card__stat-label">' + s.label + '</span></div>';
      }
    } else {
      const kbb = player.walks > 0 ? (player.strikeouts / player.walks).toFixed(2) : '—';
      const stats = [
        { label: 'WAR', val: player.war },
        { label: 'W', val: player.wins },
        { label: 'L', val: player.losses },
        { label: 'ERA', val: player.era.toFixed(2) },
        { label: 'WHIP', val: player.whip.toFixed(3) },
        { label: 'IP', val: player.ip },
        { label: 'SO', val: player.strikeouts },
        { label: 'BB', val: player.walks },
        { label: 'K/BB', val: kbb },
      ];
      for (const s of stats) {
        statsHtml += '<div class="player-card__stat"><span class="player-card__stat-val">' +
          s.val + '</span><span class="player-card__stat-label">' + s.label + '</span></div>';
      }
    }

    let imgHtml = '';
    if (player.mlbam_id) {
      imgHtml = '<img class="player-card__img" src="https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/' +
        player.mlbam_id + '/headshot/67/current" alt="' + player.name +
        '" onerror="this.style.display=\'none\'" />';
    }

    let awardsHtml = '';
    if (player.awards && player.awards.length > 0) {
      awardsHtml = '<div class="player-card__awards">' +
        player.awards.map(function(a, i) {
          var label = typeof a === 'string' ? a : a.label;
          var years = (a && a.years) ? a.years : '';
          return '<span class="player-card__award" data-award-idx="' + i + '" data-award-years="' + years + '">' + label + '</span>';
        }).join('') + '</div>' +
        '<div class="player-card__award-detail" id="award-detail">\u00A0</div>';
    }

    playerCardBody.innerHTML =
      awardsHtml +
      imgHtml +
      '<div class="player-card__name"><a href="' + bbrefUrl + '" target="_blank" rel="noopener">' +
        player.name + '</a></div>' +
      '<div class="player-card__years">' + years + '</div>' +
      '<div class="player-card__pos">' + player.position + '</div>' +
      '<div class="player-card__teams">' + player.teams.join(' · ') + '</div>' +
      '<div class="player-card__divider"></div>' +
      '<div class="player-card__stats">' + statsHtml + '</div>';

    // Award interaction: hover on desktop, tap on mobile
    var awardsEl = playerCardBody.querySelector('.player-card__awards');
    var detailEl = playerCardBody.querySelector('#award-detail');
    if (awardsEl && detailEl) {
      var showAward = function(badge) {
        var years = badge.getAttribute('data-award-years');
        if (!years) return;
        awardsEl.querySelectorAll('.player-card__award--active').forEach(function(el) {
          el.classList.remove('player-card__award--active');
        });
        badge.classList.add('player-card__award--active');
        detailEl.textContent = badge.textContent + ': ' + years;
      };
      var hideAward = function() {
        awardsEl.querySelectorAll('.player-card__award--active').forEach(function(el) {
          el.classList.remove('player-card__award--active');
        });
        detailEl.textContent = '\u00A0'; // keep space reserved
      };

      if (canHover) {
        awardsEl.querySelectorAll('[data-award-years]').forEach(function(badge) {
          badge.addEventListener('mouseenter', function() { showAward(badge); });
          badge.addEventListener('mouseleave', hideAward);
        });
      } else {
        awardsEl.addEventListener('click', function(e) {
          var badge = e.target.closest('[data-award-years]');
          if (!badge) return;
          if (badge.classList.contains('player-card__award--active')) {
            hideAward();
          } else {
            showAward(badge);
          }
        });
      }
    }

    // On desktop hover: overlay ignores pointer so name cell keeps mouseenter/leave
    if (canHover) {
      playerCardModal.style.pointerEvents = 'none';
      playerCardModal.querySelector('.player-card').style.pointerEvents = 'auto';
    } else {
      playerCardModal.style.pointerEvents = '';
      playerCardModal.querySelector('.player-card').style.pointerEvents = '';
    }

    playerCardModal.classList.remove('hidden');
  }

  // -- Guess rendering --

  function renderGuess(result, player) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    // Name cell
    row.appendChild(buildNameCell(result.name, player));

    // Position cell (hitters only)
    if (currentType === 'hitter') {
      row.appendChild(buildCell(result.position.value, result.position.state));
    }

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

  function renderRevealRow(player) {
    const result = Game.compare(player, player);
    const row = document.createElement('div');
    row.className = 'guess-row';

    // Name cell (clickable for player card)
    const nameCell = document.createElement('div');
    nameCell.className = 'guess-cell guess-cell--name';
    nameCell.style.cursor = 'pointer';
    if (canHover) {
      nameCell.addEventListener('mouseenter', () => {
        clearTimeout(cardHoverTimer);
        showPlayerCard(player);
      });
      nameCell.addEventListener('mouseleave', () => {
        cardHoverTimer = setTimeout(() => playerCardModal.classList.add('hidden'), 200);
      });
    } else {
      nameCell.addEventListener('click', (e) => {
        e.stopPropagation();
        showPlayerCard(player);
      });
    }
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    nameCell.appendChild(nameSpan);
    row.appendChild(nameCell);

    // Position (hitters only)
    if (currentType === 'hitter') {
      row.appendChild(buildPlainCell(result.position.value));
    }

    // Debut
    row.appendChild(buildPlainCell(result.debut.value));

    // Teams
    row.appendChild(buildPlainCell(result.teams.value));

    // Stats
    const statKeys = currentType === 'hitter' ? HITTER_STAT_KEYS : PITCHER_STAT_KEYS;
    for (const key of statKeys) {
      row.appendChild(buildPlainCell(result.stats[key].value));
    }

    rowsEl.appendChild(row);
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function buildPlainCell(value) {
    const cell = document.createElement('div');
    cell.className = 'guess-cell';
    const valEl = document.createElement('span');
    valEl.className = 'guess-cell__value';
    valEl.textContent = value;
    cell.appendChild(valEl);
    return cell;
  }

  function buildNameCell(nameData, player) {
    const cell = document.createElement('div');
    cell.className = 'guess-cell guess-cell--name';
    if (player) {
      cell.style.cursor = 'pointer';
      if (canHover) {
        cell.addEventListener('mouseenter', () => {
          clearTimeout(cardHoverTimer);
          showPlayerCard(player);
        });
        cell.addEventListener('mouseleave', () => {
          cardHoverTimer = setTimeout(() => playerCardModal.classList.add('hidden'), 200);
        });
      } else {
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          showPlayerCard(player);
        });
      }
    }

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
    cell.setAttribute('data-popup', 'teams');
    cell.style.cursor = 'pointer';

    const valEl = document.createElement('span');
    valEl.className = 'guess-cell__value';
    valEl.textContent = teams.value;
    cell.appendChild(valEl);

    if (teams.direction !== 'equal') {
      const arrow = document.createElement('span');
      arrow.className = 'guess-cell__arrow';
      arrow.textContent = teams.direction === 'up' ? '\u2191' : '\u2193';
      cell.appendChild(arrow);
    }

    // Show team list on hover (desktop) or click (mobile)
    const teamNames = teams.teamNames || [];
    const showTeamPopup = () => {
      if (teamNames.length === 0) return;
      const html = '<div class="popup__title">Teams (' + teamNames.length + ')</div>' +
        '<div class="popup__body">' + teamNames.join('<br>') + '</div>';
      showPopup(cell, html);
    };
    if (canHover) {
      cell.addEventListener('mouseenter', () => {
        hoverAnchor = cell;
        showTeamPopup();
      });
      cell.addEventListener('mouseleave', () => {
        setTimeout(() => { if (hoverAnchor !== popupEl) hidePopup(); }, 50);
      });
    } else {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        showTeamPopup();
      });
    }

    return cell;
  }

  // -- Result panel --

  function clearGuesses() {
    rowsEl.innerHTML = '';
    headerEl.innerHTML = '';
    revealedValues = {};
  }

  function showResult(won, player, guessCount, isDaily) {
    resultEl.classList.remove('hidden');
    resultEl.classList.toggle('result--win', won);

    resultTitle.textContent = won ? 'You got it!' : 'Game Over';
    resultAnswer.textContent = player.name;

    if (isDaily) {
      resultStats.textContent = won
        ? `Solved in ${guessCount} guess${guessCount !== 1 ? 'es' : ''}. Come back tomorrow!`
        : `The answer was ${player.name}. Come back tomorrow!`;
      giveUpBtn.classList.add('hidden');
      newGameBtn.classList.add('hidden');
    } else {
      resultStats.textContent = won
        ? `Solved in ${guessCount} guess${guessCount !== 1 ? 'es' : ''}`
        : `The answer was ${player.name}`;
      giveUpBtn.classList.add('hidden');
      newGameBtn.classList.remove('hidden');
    }
  }

  function hideResult() {
    resultEl.classList.add('hidden');
    resultEl.classList.remove('result--win');
    giveUpBtn.classList.add('hidden');
    newGameBtn.classList.add('hidden');
  }

  // -- Share image (canvas roundRect polyfill for older browsers) --

  function fillRoundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function generateShareImage(state) {
    const guesses = state.guesses;
    const isHitter = currentType === 'hitter';
    const statKeys = isHitter ? HITTER_STAT_KEYS : PITCHER_STAT_KEYS;
    const colHeaders = isHitter ? HITTER_COLS.slice(1) : PITCHER_COLS.slice(1); // exclude Name

    // Layout constants
    const pad = 20;
    const nameW = 110;    // width for player name column
    const cellW = 38;     // width for each stat cell
    const cellH = 26;     // height for each cell
    const gap = 3;        // gap between cells
    const headerH = 100;  // space for title/info
    const colHeaderH = 20; // column header row height
    const footerH = 36;
    const colCount = colHeaders.length;

    const gridW = nameW + gap + colCount * (cellW + gap) - gap;
    const canvasW = gridW + pad * 2;
    const rowH = cellH + gap;
    const revealRowExtra = !state.isWon && state.mysteryPlayer ? rowH : 0; // answer row
    const canvasH = headerH + colHeaderH + gap + guesses.length * rowH + revealRowExtra + footerH + pad;

    const scale = 2; // HiDPI: render at 2x for sharp output
    const canvas = document.createElement('canvas');
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Guess The Player', canvasW / 2, pad + 20);

    ctx.fillStyle = '#a0a0b0';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('MLB Edition', canvasW / 2, pad + 38);

    // Mode / era / difficulty
    const eraLabel = ERA_LABELS[state.era] || state.era;
    const modeLabel = state.mode === 'daily' ? 'Daily' : 'Practice';
    const diffLabel = state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);
    ctx.fillText(modeLabel + '  |  ' + eraLabel + '  |  ' + diffLabel, canvasW / 2, pad + 54);

    // Result line
    ctx.fillStyle = state.isWon ? '#2ecc71' : '#e74c3c';
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    const resultText = state.isWon
      ? 'Solved in ' + guesses.length + ' guess' + (guesses.length !== 1 ? 'es' : '')
      : 'Gave up after ' + guesses.length + ' guess' + (guesses.length !== 1 ? 'es' : '');
    ctx.fillText(resultText, canvasW / 2, pad + 72);

    // Color map
    const stateColor = {
      match: '#2ecc71',
      close: '#f1c40f',
      miss: '#e74c3c',
      neutral: '#636e72',
    };
    // Text color on colored backgrounds
    const stateTextColor = {
      match: '#ffffff',
      close: '#1a1a2e',
      miss: '#ffffff',
      neutral: '#ffffff',
    };

    const gridX = pad;
    const gridY = headerH;

    // Draw column headers
    ctx.font = 'bold 8px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#a0a0b0';
    ctx.textAlign = 'center';
    for (let c = 0; c < colHeaders.length; c++) {
      const x = gridX + nameW + gap + c * (cellW + gap) + cellW / 2;
      ctx.fillText(colHeaders[c], x, gridY + colHeaderH - 4);
    }

    // Draw each guess row
    const dataY = gridY + colHeaderH + gap;

    for (let i = 0; i < guesses.length; i++) {
      const g = guesses[i];
      const r = g.result;
      const y = dataY + i * rowH;

      // Name cell
      const nameColor = r.isCorrect ? '#f1c40f' : '#2b2b4a';
      ctx.fillStyle = nameColor;
      fillRoundRect(ctx, gridX, y, nameW, cellH, 4);
      ctx.fillStyle = r.isCorrect ? '#1a1a2e' : '#e8e8e8';
      ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left';
      // Truncate name if too long
      let displayName = g.player ? g.player.name : (r.name ? r.name.value : '');
      while (ctx.measureText(displayName).width > nameW - 10 && displayName.length > 3) {
        displayName = displayName.slice(0, -2) + '…';
      }
      ctx.fillText(displayName, gridX + 6, y + cellH / 2 + 4);

      // Build ordered cells: Pos (hitter), Debut, Teams, stats
      const cells = [];
      if (isHitter) {
        cells.push({ state: r.position.state, value: r.position.value, direction: 'equal' });
      }
      cells.push({ state: r.debut.state, value: r.debut.value, direction: r.debut.direction });
      cells.push({ state: r.teams.state, value: r.teams.value, direction: r.teams.direction });
      for (const key of statKeys) {
        const s = r.stats[key];
        cells.push({ state: s.state, value: s.value, direction: s.direction });
      }

      // Draw each stat cell with value or arrow
      ctx.textAlign = 'center';
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        const x = gridX + nameW + gap + c * (cellW + gap);
        const color = stateColor[cell.state] || '#636e72';
        const textColor = stateTextColor[cell.state] || '#ffffff';

        ctx.fillStyle = color;
        fillRoundRect(ctx, x, y, cellW, cellH, 4);

        // Determine what to show in the cell
        ctx.fillStyle = textColor;
        let cellText = '' + cell.value;
        if (cell.state === 'match' && cell.direction === 'equal') {
          // Exact match — show bullseye
          ctx.font = '13px "Segoe UI", system-ui, sans-serif';
          ctx.fillText('\u25CE', x + cellW / 2, y + cellH / 2 + 5);
        } else if (cell.direction && cell.direction !== 'equal') {
          // Has direction arrow — show value + arrow if it fits, else just arrow
          const arrow = cell.direction === 'up' ? '\u2191' : '\u2193';
          ctx.font = 'bold 9px "Segoe UI", system-ui, sans-serif';
          const textWithArrow = cellText + arrow;
          if (ctx.measureText(textWithArrow).width <= cellW - 6) {
            ctx.fillText(textWithArrow, x + cellW / 2, y + cellH / 2 + 3);
          } else if (ctx.measureText(cellText).width <= cellW - 6) {
            // Value fits without arrow — show value, put arrow below
            ctx.fillText(cellText, x + cellW / 2, y + cellH / 2 + 1);
            ctx.font = '8px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(arrow, x + cellW / 2, y + cellH - 2);
          } else {
            // Nothing fits — just show arrow
            ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(arrow, x + cellW / 2, y + cellH / 2 + 5);
          }
        } else {
          // Neutral or no direction — show value if it fits
          ctx.font = 'bold 9px "Segoe UI", system-ui, sans-serif';
          if (ctx.measureText(cellText).width <= cellW - 6) {
            ctx.fillText(cellText, x + cellW / 2, y + cellH / 2 + 3);
          }
        }
      }
    }

    // Reveal row (give-up): show mystery player with plain styling
    if (!state.isWon && state.mysteryPlayer) {
      const revealResult = Game.compare(state.mysteryPlayer, state.mysteryPlayer);
      const answerY = dataY + guesses.length * rowH;

      // Name cell
      ctx.fillStyle = '#16213e';
      fillRoundRect(ctx, gridX, answerY, nameW, cellH, 4);
      ctx.fillStyle = '#e8e8e8';
      ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left';
      let revealName = state.mysteryPlayer.name;
      while (ctx.measureText(revealName).width > nameW - 10 && revealName.length > 3) {
        revealName = revealName.slice(0, -2) + '…';
      }
      ctx.fillText(revealName, gridX + 6, answerY + cellH / 2 + 4);

      // Stat cells — plain (surface color, no state highlighting)
      const revealCells = [];
      if (isHitter) {
        revealCells.push(revealResult.position.value);
      }
      revealCells.push(revealResult.debut.value);
      revealCells.push(revealResult.teams.value);
      for (const key of statKeys) {
        revealCells.push(revealResult.stats[key].value);
      }

      ctx.textAlign = 'center';
      for (let c = 0; c < revealCells.length; c++) {
        const x = gridX + nameW + gap + c * (cellW + gap);
        ctx.fillStyle = '#16213e';
        fillRoundRect(ctx, x, answerY, cellW, cellH, 4);
        ctx.fillStyle = '#e8e8e8';
        ctx.font = 'bold 9px "Segoe UI", system-ui, sans-serif';
        const val = '' + revealCells[c];
        if (ctx.measureText(val).width <= cellW - 6) {
          ctx.fillText(val, x + cellW / 2, answerY + cellH / 2 + 3);
        }
      }
    }

    // Footer
    ctx.fillStyle = '#636e72';
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('guesstheplayer.com', canvasW / 2, canvasH - 10);

    return canvas;
  }

  function getShareImageBlob(state) {
    const canvas = generateShareImage(state);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  // -- Leaderboard --

  function showLeaderboard(results, filters) {
    const modal = document.getElementById('leaderboard-modal');
    const content = document.getElementById('leaderboard-content');
    if (!modal || !content) return;

    const eraFilter = filters.era || 'all';
    const diffFilter = filters.difficulty || 'all';

    // Filter results
    let filtered = results;
    if (eraFilter !== 'all') {
      filtered = filtered.filter(r => r.era === eraFilter);
    }
    if (diffFilter !== 'all') {
      filtered = filtered.filter(r => r.difficulty === diffFilter);
    }

    const total = filtered.length;
    const won = filtered.filter(r => r.won);
    const solvedPct = total > 0 ? Math.round((won.length / total) * 100) : 0;

    // Median guesses for won games
    let median = 0;
    if (won.length > 0) {
      const sorted = won.map(r => r.guesses).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      median = sorted.length % 2 !== 0 ? sorted[mid] : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
    }

    // Histogram: distribution of guesses for won games (1-10+)
    const buckets = {};
    for (const r of won) {
      const key = r.guesses >= 10 ? '10+' : String(r.guesses);
      buckets[key] = (buckets[key] || 0) + 1;
    }
    const maxCount = Math.max(1, ...Object.values(buckets));
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'];

    let histHtml = '<div class="histogram">';
    for (const label of labels) {
      const count = buckets[label] || 0;
      const pct = (count / maxCount) * 100;
      histHtml += '<div class="histogram__row">' +
        '<span class="histogram__label">' + label + '</span>' +
        '<div class="histogram__bar-bg"><div class="histogram__bar" style="width:' + pct + '%"></div></div>' +
        '<span class="histogram__count">' + count + '</span>' +
        '</div>';
    }
    histHtml += '</div>';

    // Build filter controls
    let filterHtml = '<div class="leaderboard__filters">' +
      '<select id="lb-era" class="select select--sm">' +
      '<option value="all"' + (eraFilter === 'all' ? ' selected' : '') + '>All Eras</option>' +
      '<option value="all-time"' + (eraFilter === 'all-time' ? ' selected' : '') + '>All-Time</option>' +
      '<option value="1940"' + (eraFilter === '1940' ? ' selected' : '') + '>1940+</option>' +
      '<option value="1960"' + (eraFilter === '1960' ? ' selected' : '') + '>1960+</option>' +
      '<option value="1980"' + (eraFilter === '1980' ? ' selected' : '') + '>1980+</option>' +
      '<option value="2000"' + (eraFilter === '2000' ? ' selected' : '') + '>2000+</option>' +
      '<option value="active"' + (eraFilter === 'active' ? ' selected' : '') + '>Active</option>' +
      '</select>' +
      '<select id="lb-diff" class="select select--sm">' +
      '<option value="all"' + (diffFilter === 'all' ? ' selected' : '') + '>All Difficulties</option>' +
      '<option value="easy"' + (diffFilter === 'easy' ? ' selected' : '') + '>Easy</option>' +
      '<option value="medium"' + (diffFilter === 'medium' ? ' selected' : '') + '>Medium</option>' +
      '<option value="hard"' + (diffFilter === 'hard' ? ' selected' : '') + '>Hard</option>' +
      '</select></div>';

    content.innerHTML =
      filterHtml +
      '<div class="leaderboard__stats">' +
      '<div class="leaderboard__stat"><span class="leaderboard__stat-val">' + total + '</span><span class="leaderboard__stat-label">Played</span></div>' +
      '<div class="leaderboard__stat"><span class="leaderboard__stat-val">' + solvedPct + '%</span><span class="leaderboard__stat-label">Solved</span></div>' +
      '<div class="leaderboard__stat"><span class="leaderboard__stat-val">' + median + '</span><span class="leaderboard__stat-label">Median</span></div>' +
      '</div>' +
      '<h3 class="leaderboard__hist-title">Guess Distribution</h3>' +
      histHtml +
      '<div class="leaderboard__clear"><button class="btn btn--clear-stats" id="lb-clear-btn">Clear Stats</button></div>';

    modal.classList.remove('hidden');
  }

  function hideLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.classList.add('hidden');
  }

  return {
    init, setupGrid, renderGuess, renderRevealRow, clearGuesses,
    showResult, hideResult, getShareImageBlob,
    showLeaderboard, hideLeaderboard, revealStat,
  };
})();
