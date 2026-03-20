/**
 * Data loading and player pool management.
 */
const DataManager = (() => {
  let allHitters = [];
  let allPitchers = [];
  let allPlayers = []; // combined for autocomplete

  async function load() {
    const [hittersResp, pitchersResp] = await Promise.all([
      fetch('data/hitters.json'),
      fetch('data/pitchers.json'),
    ]);
    allHitters = await hittersResp.json();
    allPitchers = await pitchersResp.json();
    allPlayers = [...allHitters, ...allPitchers];
  }

  function filterPool(era, difficulty) {
    const maxTier = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;

    return allPlayers.filter(p => {
      // Fame tier filter
      if (p.fame_tier > maxTier) return false;

      // Era filter
      if (era === 'active') {
        // Active = final_year is null (still playing) or recent
        return !p.final_year || p.final_year >= new Date().getFullYear() - 1;
      }
      if (era !== 'all') {
        const minYear = parseInt(era, 10);
        if (p.debut_year < minYear) return false;
      }
      return true;
    });
  }

  function getAllPlayers() {
    return allPlayers;
  }

  function isHitter(player) {
    return player.position !== 'P';
  }

  function searchPlayers(query, limit = 8) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const results = [];
    for (const p of allPlayers) {
      if (p.name.toLowerCase().includes(q)) {
        results.push(p);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  return { load, filterPool, getAllPlayers, isHitter, searchPlayers };
})();
