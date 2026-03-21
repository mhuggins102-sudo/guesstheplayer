#!/usr/bin/env python3
"""
Preprocesses Lahman baseball CSVs into game-ready JSON files.

Reads from raw_data/ and outputs to data/:
  - hitters.json  (career aggregated batting stats)
  - pitchers.json (career aggregated pitching stats)
"""

import csv
import json
import os
from collections import defaultdict

RAW = os.path.join(os.path.dirname(__file__), '..', 'raw_data')
OUT = os.path.join(os.path.dirname(__file__), '..', 'data')

# Team ID mapping: Lahman 3-letter codes -> common franchise names
TEAM_NAMES = {
    'ANA': 'LAA', 'LAA': 'LAA', 'CAL': 'LAA', 'MON': 'MON',
    'ARI': 'ARI', 'ATL': 'ATL', 'MLN': 'ATL', 'BSN': 'ATL',
    'BAL': 'BAL', 'BOS': 'BOS', 'BSA': 'BOS',
    'CHN': 'CHC', 'CHA': 'CWS', 'CHW': 'CWS',
    'CIN': 'CIN', 'CLE': 'CLE', 'CLG': 'CLE',
    'COL': 'COL', 'DET': 'DET',
    'FLO': 'MIA', 'MIA': 'MIA',
    'HOU': 'HOU', 'KCA': 'KC', 'KCR': 'KC',
    'MIN': 'MIN', 'NYN': 'NYM', 'NYA': 'NYY',
    'OAK': 'OAK', 'PHI': 'PHI', 'PIT': 'PIT',
    'SDN': 'SD', 'SDP': 'SD',
    'SEA': 'SEA', 'SFN': 'SF', 'SFG': 'SF',
    'SLN': 'STL', 'STL': 'STL',
    'TBA': 'TB', 'TBR': 'TB', 'TBD': 'TB',
    'TEX': 'TEX', 'TOR': 'TOR',
    'WAS': 'WSH', 'WSN': 'WSH', 'WAS': 'WSH',
    'ML4': 'MIL', 'MIL': 'MIL', 'MLA': 'MIL',
    'LAN': 'LAD', 'LAD': 'LAD', 'BRO': 'BRO',
    'NYG': 'NYG', 'NY1': 'NYG',
    'SLA': 'STL', 'BLA': 'BAL',
}

# Position columns in Appearances.csv -> position label
POS_COLS = [
    ('G_p', 'P'), ('G_c', 'C'), ('G_1b', '1B'), ('G_2b', '2B'),
    ('G_3b', '3B'), ('G_ss', 'SS'), ('G_lf', 'LF'), ('G_cf', 'CF'),
    ('G_rf', 'RF'), ('G_of', 'OF'), ('G_dh', 'DH'),
]

MIN_PA_HITTER = 500
MIN_IPOUTS_PITCHER = 600  # ~200 IP


def read_csv(filename):
    path = os.path.join(RAW, filename)
    with open(path, 'r', encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def safe_int(val, default=0):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def safe_float(val, default=0.0):
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def normalize_team(team_id):
    return TEAM_NAMES.get(team_id, team_id)


def get_primary_position(appearances_rows):
    """Determine primary position from appearances data."""
    pos_games = defaultdict(int)
    for row in appearances_rows:
        for col, pos in POS_COLS:
            pos_games[pos] += safe_int(row.get(col, 0))
    if not pos_games:
        return 'DH'
    return max(pos_games, key=pos_games.get)


def get_teams(appearances_rows):
    """Get franchise list sorted by games played (most games first)."""
    team_games = defaultdict(int)
    for row in appearances_rows:
        tid = row.get('teamID', '').strip()
        if tid:
            team_games[normalize_team(tid)] += safe_int(row.get('G_all', 0))
    # Sort by games descending so primary team is first
    return [t for t, _ in sorted(team_games.items(), key=lambda x: -x[1])]


def compute_fame_tier(war, is_high_war):
    """Assign fame tier based on career WAR."""
    if war >= 50:
        return 1  # Easy - legends
    elif war >= 20 or is_high_war:
        return 2  # Medium - well-known
    else:
        return 3  # Hard - role players


def build_people_lookup(people_rows):
    """Build playerID -> bio info lookup, and bbrefID -> playerID mapping."""
    lookup = {}
    bbref_to_player = {}
    for row in people_rows:
        pid = row.get('playerID', '').strip()
        if not pid:
            continue
        debut = row.get('debut', '').strip()
        final = row.get('finalGame', '').strip()
        debut_year = int(debut[:4]) if debut and len(debut) >= 4 else None
        final_year = int(final[:4]) if final and len(final) >= 4 else None
        lookup[pid] = {
            'name_first': row.get('nameFirst', '').strip(),
            'name_last': row.get('nameLast', '').strip(),
            'debut_year': debut_year,
            'final_year': final_year,
        }
        bbref_id = row.get('bbrefID', '').strip()
        if bbref_id:
            bbref_to_player[bbref_id] = pid
    return lookup, bbref_to_player


def build_appearances_lookup(appearances_rows):
    """Build playerID -> list of appearance rows."""
    lookup = defaultdict(list)
    for row in appearances_rows:
        pid = row.get('playerID', '').strip()
        if pid:
            lookup[pid].append(row)
    return lookup


def build_war_lookup(filename, bbref_to_player):
    """Build playerID -> career WAR using bbrefID mapping."""
    lookup = {}
    rows = read_csv(filename)
    for row in rows:
        bbref_id = row.get('player_ID', '').strip()
        if not bbref_id:
            continue
        war = safe_float(row.get('careerWAR', 0))
        # Map bbrefID back to Lahman playerID
        pid = bbref_to_player.get(bbref_id, bbref_id)
        lookup[pid] = war
    return lookup


def build_hitters(people, appearances, batting_rows, war_lookup):
    """Aggregate batting stats into career totals."""
    # Group batting rows by playerID
    career = defaultdict(lambda: {
        'G': 0, 'AB': 0, 'R': 0, 'H': 0, '2B': 0, '3B': 0,
        'HR': 0, 'RBI': 0, 'SB': 0, 'CS': 0, 'BB': 0, 'SO': 0,
        'IBB': 0, 'HBP': 0, 'SH': 0, 'SF': 0,
    })

    for row in batting_rows:
        pid = row.get('playerID', '').strip()
        if not pid:
            continue
        stats = career[pid]
        for key in stats:
            stats[key] += safe_int(row.get(key, 0))

    hitters = []
    for pid, stats in career.items():
        if pid not in people:
            continue
        # Filter: need minimum PA (AB + BB + HBP + SF + SH)
        pa = stats['AB'] + stats['BB'] + stats['HBP'] + stats['SF'] + stats['SH']
        if pa < MIN_PA_HITTER:
            continue

        bio = people[pid]
        if not bio['debut_year']:
            continue

        app_rows = appearances.get(pid, [])
        position = get_primary_position(app_rows)

        # Skip players whose primary position is pitcher
        if position == 'P':
            continue

        teams = get_teams(app_rows)
        war = war_lookup.get(pid, 0.0)

        # Compute stats
        avg = round(stats['H'] / stats['AB'], 3) if stats['AB'] > 0 else 0
        xbh = stats['2B'] + stats['3B'] + stats['HR']
        xbh_pct = round(xbh / stats['H'] * 100, 1) if stats['H'] > 0 else 0
        obp_num = stats['H'] + stats['BB'] + stats['HBP']
        obp_den = stats['AB'] + stats['BB'] + stats['HBP'] + stats['SF']
        obp = obp_num / obp_den if obp_den > 0 else 0
        slg = (stats['H'] + stats['2B'] + 2 * stats['3B'] + 3 * stats['HR']) / stats['AB'] if stats['AB'] > 0 else 0
        ops = round(obp + slg, 3)

        fame = compute_fame_tier(war, war >= 40)

        hitters.append({
            'id': pid,
            'name': f"{bio['name_first']} {bio['name_last']}",
            'debut_year': bio['debut_year'],
            'final_year': bio['final_year'],
            'teams': teams,
            'position': position,
            'games': stats['G'],
            'hits': stats['H'],
            'home_runs': stats['HR'],
            'rbi': stats['RBI'],
            'batting_avg': avg,
            'stolen_bases': stats['SB'],
            'walks': stats['BB'],
            'ops': ops,
            'xbh_pct': xbh_pct,
            'war': round(war, 1),
            'fame_tier': fame,
        })

    return sorted(hitters, key=lambda x: x['name'])


def build_pitchers(people, appearances, pitching_rows, war_lookup):
    """Aggregate pitching stats into career totals."""
    career = defaultdict(lambda: {
        'W': 0, 'L': 0, 'G': 0, 'GS': 0, 'CG': 0, 'SHO': 0,
        'SV': 0, 'IPouts': 0, 'H': 0, 'ER': 0, 'HR': 0,
        'BB': 0, 'SO': 0, 'IBB': 0, 'WP': 0, 'HBP': 0, 'BFP': 0,
        'R': 0,
    })

    for row in pitching_rows:
        pid = row.get('playerID', '').strip()
        if not pid:
            continue
        stats = career[pid]
        for key in stats:
            stats[key] += safe_int(row.get(key, 0))

    pitchers = []
    for pid, stats in career.items():
        if pid not in people:
            continue
        if stats['IPouts'] < MIN_IPOUTS_PITCHER:
            continue

        bio = people[pid]
        if not bio['debut_year']:
            continue

        app_rows = appearances.get(pid, [])
        teams = get_teams(app_rows)
        war = war_lookup.get(pid, 0.0)

        ip = stats['IPouts'] / 3
        era = round(stats['ER'] * 9 / ip, 2) if ip > 0 else 0
        whip = round((stats['BB'] + stats['H']) / ip, 3) if ip > 0 else 0

        fame = compute_fame_tier(war, war >= 40)

        pitchers.append({
            'id': pid,
            'name': f"{bio['name_first']} {bio['name_last']}",
            'debut_year': bio['debut_year'],
            'final_year': bio['final_year'],
            'teams': teams,
            'position': 'P',
            'games': stats['G'],
            'wins': stats['W'],
            'losses': stats['L'],
            'era': era,
            'strikeouts': stats['SO'],
            'saves': stats['SV'],
            'walks': stats['BB'],
            'whip': whip,
            'war': round(war, 1),
            'fame_tier': fame,
        })

    return sorted(pitchers, key=lambda x: x['name'])


def main():
    print('Loading CSVs...')
    people_rows = read_csv('People.csv')
    appearances_rows = read_csv('Appearances.csv')
    batting_rows = read_csv('Batting.csv')
    pitching_rows = read_csv('Pitching.csv')

    print('Building lookups...')
    people, bbref_to_player = build_people_lookup(people_rows)
    appearances = build_appearances_lookup(appearances_rows)
    war_bat = build_war_lookup('career_war_bat.csv', bbref_to_player)
    war_pit = build_war_lookup('career_war_pit.csv', bbref_to_player)

    print('Building hitters...')
    hitters = build_hitters(people, appearances, batting_rows, war_bat)
    print(f'  {len(hitters)} hitters (min {MIN_PA_HITTER} PA, non-pitcher)')

    print('Building pitchers...')
    pitchers = build_pitchers(people, appearances, pitching_rows, war_pit)
    print(f'  {len(pitchers)} pitchers (min {MIN_IPOUTS_PITCHER} IPouts)')

    # Fame tier breakdown
    for label, data in [('Hitters', hitters), ('Pitchers', pitchers)]:
        t1 = sum(1 for p in data if p['fame_tier'] == 1)
        t2 = sum(1 for p in data if p['fame_tier'] == 2)
        t3 = sum(1 for p in data if p['fame_tier'] == 3)
        print(f'  {label} fame tiers: Easy={t1}, Medium={t2}, Hard={t3}')

    os.makedirs(OUT, exist_ok=True)

    with open(os.path.join(OUT, 'hitters.json'), 'w') as f:
        json.dump(hitters, f, separators=(',', ':'))
    print(f'Wrote data/hitters.json')

    with open(os.path.join(OUT, 'pitchers.json'), 'w') as f:
        json.dump(pitchers, f, separators=(',', ':'))
    print(f'Wrote data/pitchers.json')

    print('Done!')


if __name__ == '__main__':
    main()
