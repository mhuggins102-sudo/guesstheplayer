/**
 * Main app controller — wires together data, game, UI, and autocomplete.
 */
(async function () {
  const STORAGE_KEY = 'gtp_daily_state';
  const STREAK_KEY = 'gtp_streak';

  // DOM elements
  const modeButtons = document.querySelectorAll('[data-mode]');
  const eraSelect = document.getElementById('era-select');
  const difficultySelect = document.getElementById('difficulty-select');
  const playerInput = document.getElementById('player-input');
  const autocompleteList = document.getElementById('autocomplete-list');
  const giveUpBtn = document.getElementById('give-up-btn');
  const newGameBtn = document.getElementById('new-game-btn');
  const shareBtn = document.getElementById('share-btn');

  let currentMode = 'daily';

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

  // Try to restore daily game
  if (!restoreDailyState()) {
    startNewGame();
  }

  // Event listeners
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode;
      if (newMode === currentMode) return;
      currentMode = newMode;
      modeButtons.forEach(b => b.classList.toggle('btn--active', b.dataset.mode === currentMode));
      startNewGame();
    });
  });

  eraSelect.addEventListener('change', startNewGame);
  difficultySelect.addEventListener('change', startNewGame);
  giveUpBtn.addEventListener('click', onGiveUp);
  newGameBtn.addEventListener('click', startNewGame);
  shareBtn.addEventListener('click', onShare);

  function startNewGame() {
    UI.clearGuesses();
    UI.hideResult();
    Autocomplete.setEnabled(true);

    const era = eraSelect.value;
    const difficulty = difficultySelect.value;
    const mystery = Game.startGame(currentMode, era, difficulty);

    if (!mystery || mystery.empty) {
      playerInput.placeholder = 'No players match these filters...';
      playerInput.disabled = true;
      return;
    }

    playerInput.placeholder = 'Type a player name...';
    playerInput.disabled = false;

    // Daily mode: set up grid immediately. Practice: defer until first guess.
    if (!mystery.deferred) {
      UI.setupGrid(mystery);
    }

    // Clear saved state for practice mode
    if (currentMode === 'practice') {
      clearDailyState();
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
      // This is the first guess in practice mode — makeGuess will pick the mystery player
      Game.makeGuess(player);
      const picked = Game.getMysteryPlayer();
      if (!picked) return;
      UI.setupGrid(picked);
      // Re-render the first guess now that we have the grid
      const state = Game.getState();
      const lastGuess = state.guesses[state.guesses.length - 1];
      UI.renderGuess(lastGuess.result);
      if (lastGuess.result.isCorrect) onWin();
      return;
    }

    const result = Game.makeGuess(player);
    if (!result) return;

    UI.renderGuess(result);
    saveDailyState();

    if (result.isCorrect) {
      onWin();
    }
  }

  function onWin() {
    const state = Game.getState();
    Autocomplete.setEnabled(false);
    UI.showResult(true, state.mysteryPlayer, state.guesses.length);

    if (currentMode === 'daily') {
      updateStreak(true);
    }
  }

  function onGiveUp() {
    const player = Game.giveUp();
    Autocomplete.setEnabled(false);
    UI.showResult(false, player, Game.getGuessCount());

    if (currentMode === 'daily') {
      updateStreak(false);
    }
    saveDailyState();
  }

  function onShare() {
    const state = Game.getState();
    const text = UI.generateShareText(state);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = 'Share Results'; }, 2000);
      });
    }
  }

  // -- Daily state persistence --

  function getDailyStateKey() {
    const today = new Date().toISOString().slice(0, 10);
    return `${today}-${eraSelect.value}-${difficultySelect.value}`;
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

      // Restore game
      const era = eraSelect.value;
      const difficulty = difficultySelect.value;
      const mystery = Game.startGame('daily', era, difficulty);
      if (!mystery) return false;

      UI.setupGrid(mystery);

      // Replay guesses
      const allPlayers = DataManager.getAllPlayers();
      for (const gid of data.guessIds) {
        const player = allPlayers.find(p => p.id === gid);
        if (player) {
          const result = Game.makeGuess(player);
          if (result) UI.renderGuess(result);
        }
      }

      if (data.isOver) {
        Autocomplete.setEnabled(false);
        UI.showResult(data.isWon, mystery, data.guessIds.length);
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  function clearDailyState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  function updateStreak(won) {
    try {
      const raw = localStorage.getItem(STREAK_KEY);
      const streak = raw ? JSON.parse(raw) : { current: 0, max: 0, lastDate: '' };
      const today = new Date().toISOString().slice(0, 10);

      if (streak.lastDate === today) return; // Already recorded

      if (won) {
        // Check if yesterday was also played
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
})();
