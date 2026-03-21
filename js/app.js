/**
 * Main app controller — wires together data, game, UI, and autocomplete.
 */
(async function () {
  const STORAGE_KEY = 'gtp_daily_state';
  const STREAK_KEY = 'gtp_streak';
  const PRACTICE_KEY = 'gtp_practice_results';

  // DOM elements
  const modeButtons = document.querySelectorAll('[data-mode]');
  const eraSelect = document.getElementById('era-select');
  const difficultySelect = document.getElementById('difficulty-select');
  const playerInput = document.getElementById('player-input');
  const autocompleteList = document.getElementById('autocomplete-list');
  const giveUpBtn = document.getElementById('give-up-btn');
  const newGameBtn = document.getElementById('new-game-btn');
  const shareBtn = document.getElementById('share-btn');
  const hintBtn = document.getElementById('hint-btn');
  const hintBanner = document.getElementById('hint-banner');
  const leaderboardBtn = document.getElementById('leaderboard-btn');
  const leaderboardClose = document.getElementById('leaderboard-close');
  const leaderboardModal = document.getElementById('leaderboard-modal');

  let currentMode = 'practice';
  let lbFilters = { era: 'all', difficulty: 'all' };

  // Initialize
  UI.init();

  try {
    await DataManager.load();
  } catch (err) {
    playerInput.placeholder = 'Error loading data...';
    playerInput.disabled = true;
    console.error('Failed to load player data:', err);
    return;
  }

  Autocomplete.init(playerInput, autocompleteList, onPlayerSelected);

  // Start in practice mode
  startNewGame();

  // Event listeners
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode;
      if (newMode === currentMode) return;
      currentMode = newMode;
      modeButtons.forEach(b => b.classList.toggle('btn--active', b.dataset.mode === currentMode));
      if (currentMode === 'daily' && restoreDailyState()) return;
      startNewGame();
    });
  });

  eraSelect.addEventListener('change', startNewGame);
  difficultySelect.addEventListener('change', startNewGame);
  giveUpBtn.addEventListener('click', onGiveUp);
  newGameBtn.addEventListener('click', startNewGame);
  shareBtn.addEventListener('click', onShare);
  hintBtn.addEventListener('click', onHint);

  // Leaderboard
  if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', () => {
      lbFilters = { era: 'all', difficulty: 'all' };
      showLeaderboard();
    });
  }
  if (leaderboardClose) {
    leaderboardClose.addEventListener('click', () => UI.hideLeaderboard());
  }
  if (leaderboardModal) {
    leaderboardModal.addEventListener('click', (e) => {
      if (e.target === leaderboardModal) UI.hideLeaderboard();
    });
    // Filter change listeners (delegated)
    leaderboardModal.addEventListener('change', (e) => {
      if (e.target.id === 'lb-era') {
        lbFilters.era = e.target.value;
        showLeaderboard();
      } else if (e.target.id === 'lb-diff') {
        lbFilters.difficulty = e.target.value;
        showLeaderboard();
      }
    });
    // Clear stats button (delegated)
    leaderboardModal.addEventListener('click', (e) => {
      if (e.target.id === 'lb-clear-btn') {
        if (confirm('Clear all practice stats? This cannot be undone.')) {
          clearPracticeResults();
          showLeaderboard();
        }
      }
    });
  }

  function startNewGame() {
    UI.clearGuesses();
    UI.hideResult();
    Autocomplete.setEnabled(true);
    hintBtn.classList.add('hidden');
    hintBanner.classList.add('hidden');

    const era = eraSelect.value;
    const difficulty = difficultySelect.value;
    const mystery = Game.startGame(currentMode, era, difficulty);

    if (!mystery || mystery.empty) {
      playerInput.placeholder = 'No players match these filters...';
      playerInput.disabled = true;
      return;
    }

    playerInput.disabled = false;

    if (currentMode === 'daily') {
      const info = Game.getDailyInfo();
      if (info) {
        // Lock dropdowns to daily settings
        difficultySelect.value = info.difficulty;
        difficultySelect.disabled = true;
        eraSelect.disabled = true;
        eraSelect.classList.add('select--daily');
        difficultySelect.classList.add('select--daily');

        const typeLabel = info.type === 'hitter' ? "hitter's" : "pitcher's";
        playerInput.placeholder = `Type a ${typeLabel} name...`;
      }
      UI.setupGrid(mystery);
    } else {
      // Practice mode
      eraSelect.classList.remove('select--daily');
      difficultySelect.classList.remove('select--daily');
      eraSelect.disabled = false;
      difficultySelect.disabled = false;
      playerInput.placeholder = 'Type a player name...';
    }
  }

  function onPlayerSelected(player) {
    if (Game.alreadyGuessed(player.id)) {
      playerInput.placeholder = 'Already guessed! Try another...';
      return;
    }

    // Practice mode: first guess sets up the grid based on player type
    const mystery = Game.getMysteryPlayer();
    if (!mystery) {
      Game.makeGuess(player);
      const picked = Game.getMysteryPlayer();
      if (!picked) return;
      UI.setupGrid(picked);
      const state = Game.getState();
      const lastGuess = state.guesses[state.guesses.length - 1];
      UI.renderGuess(lastGuess.result, lastGuess.player);
      giveUpBtn.classList.remove('hidden');
      updateHintButton();
      if (lastGuess.result.isCorrect) onWin();
      return;
    }

    const result = Game.makeGuess(player);
    if (!result) return;

    UI.renderGuess(result, player);
    giveUpBtn.classList.remove('hidden');
    updateHintButton();
    saveDailyState();

    if (result.isCorrect) {
      onWin();
    }
  }

  function onWin() {
    const state = Game.getState();
    Autocomplete.setEnabled(false);
    hintBtn.classList.add('hidden');
    UI.showResult(true, state.mysteryPlayer, state.guesses.length, currentMode === 'daily');

    if (currentMode === 'daily') {
      updateStreak(true);
    } else {
      savePracticeResult(true, state.guesses.length);
    }
  }

  function onGiveUp() {
    const player = Game.giveUp();
    if (!player) return; // Practice mode with no guesses yet
    Autocomplete.setEnabled(false);
    hintBtn.classList.add('hidden');
    UI.showResult(false, player, Game.getGuessCount(), currentMode === 'daily');

    if (currentMode === 'daily') {
      updateStreak(false);
    } else {
      savePracticeResult(false, Game.getGuessCount());
    }
    saveDailyState();
  }

  function updateHintButton() {
    const count = Game.getGuessCount();
    const state = Game.getState();
    if (count >= 4 && !state.isOver) {
      hintBtn.classList.remove('hidden');
    } else {
      hintBtn.classList.add('hidden');
    }
    hintBtn.disabled = false;
  }

  function onHint() {
    const hint = Game.useHint();
    if (!hint) return;

    hintBanner.textContent = hint.text;
    hintBanner.classList.remove('hidden');
    hintBtn.disabled = true;

    // If hint reveals a stat value, update the header popup
    if (hint.colName && hint.value !== undefined) {
      UI.revealStat(hint.colName, hint.value);
    }
  }

  async function onShare() {
    const state = Game.getState();
    const blob = await UI.getShareImageBlob(state);
    if (!blob) return;

    const file = new File([blob], 'guess-the-player.png', { type: 'image/png' });

    // Try native share (mobile)
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // user cancelled
      }
    }

    // Try clipboard image copy (desktop)
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        shareBtn.textContent = 'Image Copied!';
        setTimeout(() => { shareBtn.textContent = 'Share Results'; }, 2000);
        return;
      } catch (e) { /* fall through */ }
    }

    // Fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guess-the-player.png';
    a.click();
    URL.revokeObjectURL(url);
    shareBtn.textContent = 'Downloaded!';
    setTimeout(() => { shareBtn.textContent = 'Share Results'; }, 2000);
  }

  // -- Daily state persistence --

  function getDailyStateKey() {
    const today = new Date().toISOString().slice(0, 10);
    // Daily difficulty is auto-determined, so key is just date + era
    return `${today}-${eraSelect.value}`;
  }

  function saveDailyState() {
    if (currentMode !== 'daily') return;
    const state = Game.getState();
    const data = {
      key: getDailyStateKey(),
      guessIds: state.guesses.map(g => g.player.id),
      isOver: state.isOver,
      isWon: state.isWon,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function restoreDailyState() {
    if (currentMode !== 'daily') return false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.key !== getDailyStateKey()) return false;

      const era = eraSelect.value;
      const difficulty = difficultySelect.value;
      const mystery = Game.startGame('daily', era, difficulty);
      if (!mystery || mystery.empty) return false;

      // Lock dropdowns for daily
      const info = Game.getDailyInfo();
      if (info) {
        difficultySelect.value = info.difficulty;
        difficultySelect.disabled = true;
        eraSelect.disabled = true;
        eraSelect.classList.add('select--daily');
        difficultySelect.classList.add('select--daily');

        const typeLabel = info.type === 'hitter' ? "hitter's" : "pitcher's";
        playerInput.placeholder = `Type a ${typeLabel} name...`;
      }

      UI.setupGrid(mystery);

      const allPlayers = DataManager.getAllPlayers();
      for (const gid of data.guessIds) {
        const player = allPlayers.find(p => p.id === gid);
        if (player) {
          const result = Game.makeGuess(player);
          if (result) UI.renderGuess(result, player);
        }
      }

      // Show give-up if guesses were made
      if (data.guessIds.length > 0 && !data.isOver) {
        giveUpBtn.classList.remove('hidden');
      }

      if (data.isOver) {
        Autocomplete.setEnabled(false);
        UI.showResult(data.isWon, mystery, data.guessIds.length, true);
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  function updateStreak(won) {
    try {
      const raw = localStorage.getItem(STREAK_KEY);
      const streak = raw ? JSON.parse(raw) : { current: 0, max: 0, lastDate: '' };
      const today = new Date().toISOString().slice(0, 10);

      if (streak.lastDate === today) return;

      if (won) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (streak.lastDate === yesterday) {
          streak.current++;
        } else {
          streak.current = 1;
        }
        streak.max = Math.max(streak.max, streak.current);
      } else {
        streak.current = 0;
      }
      streak.lastDate = today;
      localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
    } catch (e) { /* ignore */ }
  }

  // -- Practice results tracking --

  function loadPracticeResults() {
    try {
      const raw = localStorage.getItem(PRACTICE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function clearPracticeResults() {
    try { localStorage.removeItem(PRACTICE_KEY); } catch (e) { /* ignore */ }
  }

  function savePracticeResult(won, guessCount) {
    try {
      const results = loadPracticeResults();
      const state = Game.getState();
      results.push({
        date: new Date().toISOString().slice(0, 10),
        era: state.era,
        difficulty: state.difficulty,
        guesses: guessCount,
        won: won,
      });
      localStorage.setItem(PRACTICE_KEY, JSON.stringify(results));
    } catch (e) { /* ignore */ }
  }

  function showLeaderboard() {
    const results = loadPracticeResults();
    UI.showLeaderboard(results, lbFilters);
  }
})();
