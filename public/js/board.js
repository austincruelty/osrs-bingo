const socket = io();
let currentEventId = null;
let currentBoard = null;
let tilesData = [];
let selectedTeam = null; // null = all teams, or a team_number integer
let _timerState = null;

const OSRS_MASTER_DROPS = [
  // God Wars Dungeon
  'Bandos chestplate','Bandos tassets','Bandos boots','Bandos hilt',
  'Saradomin sword','Armadyl crossbow','Saradomin hilt',
  'Staff of the dead','Zamorakian spear','Steam battlestaff','Zamorak hilt',
  'Armadyl helmet','Armadyl chestplate','Armadyl chainskirt','Armadyl hilt',
  'Torva full helm','Torva platebody','Torva platelegs','Zaryte vambraces','Nihil horn','Ancient hilt',
  // Wilderness
  'Tyrannical ring','Voidwaker gem','Treasonous ring','Voidwaker blade','Ring of the gods','Voidwaker hilt',
  'Dragon pickaxe','Dragon 2h sword','KBD heads','Draconic visage',
  'Odium shard 1','Malediction shard 1','Ancient staff',
  'Odium shard 2','Malediction shard 2','Fedora',
  'Odium shard 3','Malediction shard 3',
  // Slayer
  'Abyssal dagger','Bludgeon axon','Bludgeon spine','Bludgeon claw','Jar of miasma',
  "Hydra's eye","Hydra's fang","Hydra's heart",'Hydra leather','Hydra tail',
  'Dragon knife','Dragon thrownaxe','Jar of chemicals',
  'Primordial crystal','Pegasian crystal','Eternal crystal','Smouldering stone','Jar of souls',
  'Black tourmaline core','Granite gloves','Granite hammer','Granite ring','Jar of stone',
  'Trident of the seas (full)','Kraken tentacle','Jar of dirt',
  'Dexterous prayer scroll','Arcane prayer scroll','Dark claw','Jar of darkness',
  'Smoke battlestaff','Occult necklace','Jar of smoke','Basilisk jaw',
  // Chambers of Xeric
  'Twisted bow','Kodai insignia','Elder maul','Dragon hunter crossbow',
  "Dinh's bulwark",'Dragon claws','Ancestral hat','Ancestral robe top','Ancestral robe bottom','Twisted buckler',
  // Theatre of Blood
  'Scythe of vitur (uncharged)','Sanguinesti staff (uncharged)','Ghrazi rapier',
  'Justiciar faceguard','Justiciar chestguard','Justiciar legguards','Avernic defender hilt','Jar of decay',
  // Tombs of Amascut
  "Osmumten's fang","Elidinis' ward","Tumeken's shadow (uncharged)",
  'Masori mask','Masori body','Masori chaps','Lightbearer','Jar of the scarab',
  // Desert Treasure II
  'Chromium ingot',"Awakener's orb",'Virtus mask','Virtus robe top','Virtus robe bottom',
  'Magus ring vestige','Bellator ring vestige','Ultor ring vestige','Venator ring vestige',"Leviathan's lure",
  'Jar of dreams',
  // Dagannoth Kings
  'Berserker ring','Dragon axe','Mud battlestaff','Seers ring','Archer ring','Warrior ring',
  // Barrows
  "Ahrim's hood","Ahrim's robetop","Ahrim's robeskirt","Ahrim's staff",
  "Dharok's greataxe","Dharok's helm","Dharok's platebody","Dharok's platelegs",
  "Guthan's warspear","Guthan's helm","Guthan's platebody","Guthan's chainskirt",
  "Karil's crossbow","Karil's coif","Karil's leathertop","Karil's leatherskirt",
  "Torag's hammers","Torag's helm","Torag's platebody","Torag's platelegs",
  "Verac's flail","Verac's helm","Verac's brassard","Verac's plateskirt",
  // Other bosses
  'Spectral sigil','Arcane sigil','Elysian sigil','Holy elixir','Spirit shield',
  'Tanzanite fang','Magic fang','Serpentine visage','Tanzanite mutagen','Magma mutagen','Jar of swamp',
  'Skeletal visage','Dragonbone necklace','Dragon chainbody','Jar of sand',
  'Mole skin','Mole claw','Sarachnis cudgel','Giant egg sac','Jar of eyes',
  "Bryophyta's essence",
  "Inquisitor's great helm","Inquisitor's hauberk","Inquisitor's plateskirt","Inquisitor's mace",
  'Nightmare staff','Eldritch orb','Volatile orb','Harmonised orb',
  'Tackle box','Spirit angler headband','Spirit angler top','Spirit angler waders','Spirit angler boots',
  'Pyromancer hood','Pyromancer garb','Pyromancer robe','Pyromancer boots','Warm gloves','Tome of fire',
  'Infernal cape','Jar of ancient effigies','Fire cape',
  // Fortis Colosseum
  "Dizana's quiver",'Sunfire fanatic helm','Sunfire fanatic cuirass','Sunfire fanatic chausses',
  'Echo crystal','Tonalztics of ralos',
  // Newer bosses
  'Araxyte fang','Noxious pommel','Noxious point','Noxious blade',
  'Glacyte boots','Blessed axe','Hueycoatl hide','Snake boots',
  // Pets
  'General Graardor','Zilyana',"K'ril Tsutsaroth","Kree'arra",'Nexling',
  'Callisto cub','Venenatis spiderling',"Vet'ion jr.","Calvar'ion jr.",
  'Chaos elemental jr.','Prince black dragon',"Scorpia's offspring",
  'Abyssal orphan','Ikkle Hydra','Hellpuppy','Noon','Pet kraken','Skotos','Pet smoke devil',
  'Olmlet',"Lil' Zik",'Duke','Levi','Wisp','Butch',
  'Dagannoth Rex','Dagannoth Prime','Dagannoth Supreme',
  'Corporeal critter','Pet snakeling','Vorki','Kalphite princess','Baby mole','Sraracha',
  'Little nightmare','Tiny tempor','Phoenix','Jal-nib-rek','TzRek-Jad','Smol heredit',
  'Araxyte','Amoxliatl','Hueycoatl',
];

const TEAM_COLORS = [
  '#4a7fc1', // 1 — blue
  '#c85a1a', // 2 — orange
  '#3db560', // 3 — green
  '#9b3dc8', // 4 — purple
  '#c8b240', // 5 — gold
  '#c83d6a', // 6 — crimson
];

function teamColor(teamNum) {
  return TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length];
}

const eventSelect = document.getElementById('event-select');
const boardEl = document.getElementById('board');
const statusBar = document.getElementById('status-bar');

async function loadEvents() {
  const res = await fetch('/api/events');
  const events = await res.json();
  const landingContainer = document.getElementById('landing-events');
  landingContainer.innerHTML = '';

  if (!events.length) {
    landingContainer.innerHTML = '<p class="landing-no-events">No events found.</p>';
    return;
  }

  const active = events.filter(ev => ev.status === 'active');
  const ended  = events.filter(ev => ev.status !== 'active');

  function makeBtn(ev) {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = `${ev.name} (${ev.status})`;
    eventSelect.appendChild(opt);

    const btn = document.createElement('button');
    const typeTag = ev.game_type === 'roulette' ? ' 🎰' : '';
    btn.className = 'landing-event-btn' + (ev.status === 'ended' ? ' ended' : '');
    btn.innerHTML = `<span class="landing-event-name">${escHtml(ev.name)}${typeTag}</span><span class="landing-event-status ${ev.status}">${ev.status === 'active' ? 'Live' : 'Ended'}</span>`;
    btn.addEventListener('click', () => {
      if (ev.game_type === 'roulette') {
        window.location.href = `/roulette.html?event=${ev.id}`;
      } else {
        landingSelectEvent(String(ev.id));
      }
    });
    return btn;
  }

  active.forEach(ev => landingContainer.appendChild(makeBtn(ev)));

  if (ended.length) {
    if (active.length) {
      const divider = document.createElement('div');
      divider.className = 'landing-section-label';
      divider.textContent = 'Past Events';
      landingContainer.appendChild(divider);
    }
    ended.forEach(ev => landingContainer.appendChild(makeBtn(ev)));
  }

  if (!active.length && !ended.length) {
    landingContainer.innerHTML = '<p class="landing-no-events">No events found.</p>';
  }
}

function showLanding() {
  const landing = document.getElementById('landing');
  landing.style.display = '';
  requestAnimationFrame(() => landing.classList.remove('hidden'));
}

function landingSelectEvent(eventId) {
  const landing = document.getElementById('landing');
  landing.classList.add('hidden');
  landing.addEventListener('transitionend', () => { landing.style.display = 'none'; }, { once: true });
  eventSelect.value = eventId;
  eventSelect.dispatchEvent(new Event('change'));
}

eventSelect.addEventListener('change', () => {
  if (currentEventId) socket.emit('leave-event', currentEventId);
  currentEventId = eventSelect.value || null;
  selectedTeam = null;
  if (currentEventId) {
    socket.emit('join-event', currentEventId);
    loadBoard();
    loadTilesForModal();
    loadFeed();
    loadBingoTimer(currentEventId);
  } else {
    boardEl.innerHTML = '';
    document.getElementById('scoreboard').style.display = 'none';
    const eb = document.getElementById('ended-banner'); if (eb) eb.style.display = 'none';
    const sb = document.getElementById('submit-btn'); if (sb) sb.style.display = '';
    const legend = document.getElementById('legend');
    if (legend) legend.style.display = 'none';
    document.getElementById('team-view-bar').style.display = 'none';
    document.getElementById('feed-list').innerHTML = '<p class="feed-empty">Select an event to see drops.</p>';
  }
});

socket.on('board-update', ({ eventId }) => {
  if (String(eventId) === String(currentEventId)) { loadBoard(); loadFeed(); }
});

async function loadBoard() {
  if (!currentEventId) return;
  const res = await fetch(`/api/events/${currentEventId}/board`);
  if (!res.ok) { statusBar.textContent = 'Failed to load board.'; return; }
  currentBoard = await res.json();
  renderBoard(currentBoard);
}

// ── Team view toggle ────────────────────────────────────────

function toggleTeamView(teamNum) {
  selectedTeam = (selectedTeam === teamNum) ? null : teamNum;
  if (currentBoard) renderBoard(currentBoard);
}

// ── Render ──────────────────────────────────────────────────

function renderBoard(data) {
  const { event, tiles, teams = [], members = [] } = data;

  document.title = `${event.name} — Veritas Bingo`;

  // ── Scoreboard ──
  const scoreboard = document.getElementById('scoreboard');
  scoreboard.style.display = 'flex';
  const teamCards = teams.map(team => {
    const color = teamColor(team.team_number);
    const isActive = selectedTeam === team.team_number;
    const isDimmed = selectedTeam !== null && selectedTeam !== team.team_number;
    const teamMembers = members.filter(m => m.team === team.team_number);
    const borderStyle = isActive ? `border-color:${color};box-shadow:0 0 20px ${color}33;` : '';
    const opacityStyle = isDimmed ? 'opacity:0.4;' : '';
    const nameHtml = escHtml(team.team_name) + (team.bingo ? ' <span class="bingo-badge">BINGO!</span>' : '');
    return `
      <div class="team-card${team.bingo ? ' bingo' : ''}"
           onclick="toggleTeamView(${team.team_number})"
           title="Click to view this team's board"
           style="${borderStyle}${opacityStyle}">
        <h2 style="color:${color}bb;">${nameHtml}</h2>
        <div><span class="tiles-done">${team.points}</span> <span class="tiles-label">pts</span></div>
        <div class="tiles-sub">${team.tiles_complete} tile${team.tiles_complete !== 1 ? 's' : ''} complete</div>
        <div class="view-hint">Click to view board</div>
        <div class="team-roster">${teamMembers.map(m => `<span class="roster-pill">${escHtml(m.player_name)}</span>`).join('')}</div>
      </div>`;
  });
  const timerCard = `<div class="timer-center-card" id="timer-center-card"><div class="timer-center-label">Time Left</div><div class="timer-center-digits" id="timer-center-digits">—</div></div>`;
  if (teamCards.length === 2) {
    scoreboard.innerHTML = teamCards[0] + timerCard + teamCards[1];
  } else {
    scoreboard.innerHTML = teamCards.join('') + timerCard;
  }
  renderBingoTimer();

  // ── Legend ──
  const legend = document.getElementById('legend');
  if (legend) {
    legend.style.display = '';
    document.getElementById('legend-items').innerHTML = teams.map(team => {
      const color = teamColor(team.team_number);
      return `<div class="legend-item"><div class="legend-dot" style="background:${color};box-shadow:0 0 4px ${color}"></div> <span>${escHtml(team.team_name)} done</span></div>`;
    }).join('');
  }

  // ── Team select in submit modal ──
  const teamSelect = document.getElementById('f-team');
  teamSelect.innerHTML = '<option value="">Select team...</option>' +
    teams.map(t => `<option value="${t.team_number}">${escHtml(t.team_name)}</option>`).join('');

  // ── Team-view bar ──
  const bar = document.getElementById('team-view-bar');
  const barLabel = document.getElementById('team-view-label');
  if (selectedTeam !== null) {
    const selTeam = teams.find(t => t.team_number === selectedTeam);
    if (selTeam) {
      bar.style.display = 'flex';
      barLabel.textContent = `Viewing ${selTeam.team_name}'s Board`;
      barLabel.style.color = teamColor(selTeam.team_number);
    }
  } else {
    bar.style.display = 'none';
  }

  // ── Board grid ──
  let maxRow = 0, maxCol = 0;
  tiles.forEach(t => { if (t.row > maxRow) maxRow = t.row; if (t.col > maxCol) maxCol = t.col; });
  const cols = maxCol + 1;
  const rows = maxRow + 1;
  boardEl.style.gridTemplateColumns = `repeat(${cols}, minmax(130px, 1fr))`;
  boardEl.innerHTML = '';

  const tileMap = {};
  tiles.forEach(t => { tileMap[`${t.row},${t.col}`] = t; });

  const teamsToShow = selectedTeam !== null
    ? teams.filter(t => t.team_number === selectedTeam)
    : teams;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = tileMap[`${r},${c}`];
      const el = document.createElement('div');
      el.className = 'tile';

      if (!tile) {
        el.style.background = 'transparent';
        el.style.border = 'none';
        boardEl.appendChild(el);
        continue;
      }

      // Compute completed teams within current view
      const completedInView = teamsToShow.filter(t => tile.complete && tile.complete[t.team_number]);
      if (completedInView.length >= 2) {
        el.style.borderColor = '#c89b3c';
        el.style.boxShadow = '0 0 12px #c89b3c44';
        el.style.background = 'linear-gradient(160deg, #1a1508, #150f02)';
      } else if (completedInView.length === 1) {
        const color = teamColor(completedInView[0].team_number);
        el.style.borderColor = color;
        el.style.boxShadow = `0 0 8px ${color}33`;
      }

      // In single-team view, dim tiles where another team is done but selected is not
      if (selectedTeam !== null) {
        const myDone = tile.complete && tile.complete[selectedTeam];
        const anyOtherDone = teams.some(t => t.team_number !== selectedTeam && tile.complete && tile.complete[t.team_number]);
        if (!myDone && anyOtherDone) el.style.opacity = '0.75';
      }

      const headerSprite = `<img src="${itemSpriteUrl(tile.tile_name)}" class="tile-header-sprite" onerror="this.style.display='none'" alt="">`;

      const itemsHtml = tile.items.map(item => {
        const stars = '★'.repeat(item.points || 1);
        const qty = item.quantity || 1;

        let progressHtml = '';
        for (const team of teamsToShow) {
          const color = teamColor(team.team_number);
          const cnt = (item.counts && item.counts[team.team_number]) || 0;
          const isDone = item.done && item.done[team.team_number];
          if (qty > 1) {
            progressHtml += `<span class="qty-progress" style="color:${color};border:1px solid ${color}55;${isDone ? 'opacity:0.5;' : ''}">${cnt}/${qty}</span>`;
          } else {
            progressHtml += `<span class="dot" style="${isDone ? `background:${color};border-color:${color};box-shadow:0 0 4px ${color}88` : ''}"></span>`;
          }
        }

        const isDoneForSelected = selectedTeam !== null && item.done && item.done[selectedTeam];
        return `
          <div class="tile-item${isDoneForSelected ? ' item-done' : ''}">
            <img src="${itemSpriteUrl(item.item_name, item.wiki_image)}" class="item-sprite" onerror="this.style.display='none'" alt="">
            <span class="item-stars">${escHtml(stars)}</span>
            <span class="tile-item-name">${escHtml(item.item_name)}</span>
            <span class="team-dots">${progressHtml}</span>
          </div>`;
      }).join('');

      const groupsHtml = (tile.groups || []).map(group => {
        let headerDots = '';
        for (const team of teamsToShow) {
          const color = teamColor(team.team_number);
          const cnt = Math.min(group.totalCounts[team.team_number] || 0, group.target_count);
          const isDone = group.done && group.done[team.team_number];
          headerDots += `<span class="qty-progress" style="color:${color};border:1px solid ${color}55;${isDone ? 'opacity:0.5;' : ''}">${cnt}/${group.target_count}</span>`;
        }
        const groupItemsHtml = (group.items || []).map(item => {
          let dots = '';
          for (const team of teamsToShow) {
            const color = teamColor(team.team_number);
            const got = (item.counts && item.counts[team.team_number] > 0);
            dots += `<span class="dot" style="${got ? `background:${color};border-color:${color};box-shadow:0 0 4px ${color}88` : ''}"></span>`;
          }
          const isDoneForSelected = selectedTeam !== null && item.counts && item.counts[selectedTeam] > 0;
          return `<div class="tile-item${isDoneForSelected ? ' item-done' : ''}">
            <img src="${itemSpriteUrl(item.item_name, item.wiki_image)}" class="item-sprite" onerror="this.style.display='none'" alt="">
            <span class="tile-item-name">${escHtml(item.item_name)}</span>
            <span class="team-dots">${dots}</span>
          </div>`;
        }).join('');
        return `<div class="tile-group">
          <div class="tile-group-header" onclick="toggleGroup(this)">
            <span class="group-toggle">▶</span>
            <span class="item-stars">${'★'.repeat(group.points || 1)}</span>
            <span class="group-label">${escHtml(group.group_name)}</span>
            <span class="team-dots">${headerDots}</span>
          </div>
          <div class="tile-group-items">${groupItemsHtml}</div>
        </div>`;
      }).join('');

      el.innerHTML = `<div class="tile-header">${headerSprite}<span class="tile-name">${escHtml(tile.tile_name)}</span></div>` + itemsHtml + groupsHtml;
      boardEl.appendChild(el);
    }
  }

  statusBar.textContent = `${event.name} · ${event.status} · ${tiles.length} tiles`;

  // ── Ended event read-only state ──
  const isEnded = event.status === 'ended';
  const submitBtn = document.getElementById('submit-btn');
  const endedBanner = document.getElementById('ended-banner');
  if (submitBtn) submitBtn.style.display = isEnded ? 'none' : '';
  if (endedBanner) endedBanner.style.display = isEnded ? 'block' : 'none';

  // ── Rules section ──
  const rulesSection = document.getElementById('rules-section');
  const rulesText = document.getElementById('rules-text');
  if (event.rules && event.rules.trim()) {
    rulesText.textContent = event.rules.trim();
    rulesSection.style.display = '';
  } else {
    rulesSection.style.display = 'none';
  }
}

function toggleGroup(headerEl) {
  const group = headerEl.closest('.tile-group');
  const open = group.classList.toggle('open');
  headerEl.querySelector('.group-toggle').textContent = open ? '▼' : '▶';
}

function toggleRules() {
  const body = document.getElementById('rules-body');
  const icon = document.getElementById('rules-toggle-icon');
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  icon.textContent = open ? '▼' : '▶';
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function itemSpriteUrl(itemName, wikiImage) {
  if (wikiImage && wikiImage.trim()) {
    const fn = wikiImage.trim().replace(/\.png$/i, '');
    return `https://oldschool.runescape.wiki/images/${encodeURIComponent(fn)}.png`;
  }
  const clean = (itemName || '').trim().replace(/\s+x\d+$/i, '').replace(/^\d+x\s+/i, '').trim();
  const wikiName = clean.charAt(0).toUpperCase() + clean.slice(1).replace(/ /g, '_');
  return `https://oldschool.runescape.wiki/images/${encodeURIComponent(wikiName)}.png`;
}

// ── Submit modal ────────────────────────────────────────────

async function loadTilesForModal() {
  if (!currentEventId) return;
  const res = await fetch(`/api/events/${currentEventId}/tiles`);
  tilesData = await res.json();
}

// Flat list of all items across all tiles for autocomplete
function allBoardItems() {
  const items = [];
  tilesData.forEach(tile => {
    (tile.items || []).forEach(item => {
      items.push({ id: item.id, item_name: item.item_name, tile_name: tile.tile_name, wiki_image: item.wiki_image });
    });
    (tile.groups || []).forEach(group => {
      (group.items || []).forEach(item => {
        items.push({ id: item.id, item_name: item.item_name, tile_name: `${tile.tile_name} · ${group.group_name}`, wiki_image: item.wiki_image });
      });
    });
  });
  return items;
}

function itemSearch(query) {
  const suggestionsEl = document.getElementById('item-suggestions');
  suggestionsEl.innerHTML = '';

  // Always reset selection when user types
  document.getElementById('f-item').value = '';
  updateTileDisplay(null);

  const q = query.trim().toLowerCase();
  if (!q) { suggestionsEl.style.display = 'none'; return; }

  // Index board items by lowercase name for fast lookup
  const boardByName = {};
  allBoardItems().forEach(item => { boardByName[item.item_name.toLowerCase()] = item; });

  // Board items that match query (on the current bingo board)
  const results = [];
  const seen = new Set();
  allBoardItems().forEach(item => {
    if (item.item_name.toLowerCase().includes(q)) {
      seen.add(item.item_name.toLowerCase());
      results.push({ ...item, onBoard: true });
    }
  });

  // Master drop list items that match but aren't on the board
  OSRS_MASTER_DROPS.forEach(name => {
    if (name.toLowerCase().includes(q) && !seen.has(name.toLowerCase())) {
      results.push({ item_name: name, onBoard: false, id: null, tile_name: null, wiki_image: null });
    }
  });

  if (!results.length) { suggestionsEl.style.display = 'none'; return; }

  results.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item-suggestion' + (item.onBoard ? '' : ' offboard');
    div.innerHTML = `
      <span class="item-suggestion-name">
        <img src="${itemSpriteUrl(item.item_name, item.wiki_image)}" style="width:18px;height:18px;object-fit:contain;image-rendering:pixelated;vertical-align:middle;margin-right:6px;" onerror="this.style.display='none'" alt="">
        ${escHtml(item.item_name)}
      </span>
      <span class="item-suggestion-tile${item.onBoard ? ' onboard' : ''}">${item.onBoard ? escHtml(item.tile_name) : 'Not on board'}</span>`;
    if (item.onBoard) {
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        document.getElementById('f-item-search').value = item.item_name;
        document.getElementById('f-item').value = item.id;
        updateTileDisplay(item.tile_name);
        suggestionsEl.style.display = 'none';
      });
    }
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.style.display = 'block';
}

function updateTileDisplay(tileName) {
  const el = document.getElementById('f-tile-display');
  if (!el) return;
  if (tileName) {
    el.textContent = tileName;
    el.style.color = '#c89b3c';
    el.style.borderColor = '#c89b3c44';
  } else {
    el.textContent = '— select a drop first —';
    el.style.color = '#445';
    el.style.borderColor = '#1e2a40';
  }
}

function itemBlur() {
  setTimeout(() => {
    const el = document.getElementById('item-suggestions');
    if (el) el.style.display = 'none';
  }, 150);
}

function openSubmitModal() {
  if (!currentEventId) { alert('Please select an event first.'); return; }
  document.getElementById('upload-status').textContent = '';
  document.getElementById('f-item-search').value = '';
  document.getElementById('f-item').value = '';
  document.getElementById('item-suggestions').style.display = 'none';
  updateTileDisplay(null);
  document.getElementById('upload-modal').classList.add('open');
}

function closeSubmitModal() {
  document.getElementById('upload-modal').classList.remove('open');
}

async function submitDrop() {
  const player = document.getElementById('f-player').value.trim();
  const team = document.getElementById('f-team').value;
  const tileItemId = document.getElementById('f-item').value;
  const file = document.getElementById('f-screenshot').files[0];
  const statusEl = document.getElementById('upload-status');

  if (!player) { statusEl.className = 'error'; statusEl.textContent = 'Enter your RSN.'; return; }
  if (!team) { statusEl.className = 'error'; statusEl.textContent = 'Select your team.'; return; }
  if (!tileItemId) { statusEl.className = 'error'; statusEl.textContent = 'Select a drop from the list.'; return; }
  if (!file) { statusEl.className = 'error'; statusEl.textContent = 'Upload a screenshot.'; return; }

  statusEl.className = '';
  statusEl.textContent = 'Verifying screenshot...';

  const form = new FormData();
  form.append('player_name', player);
  form.append('team', team);
  form.append('tile_item_id', tileItemId);
  form.append('screenshot', file);

  try {
    const res = await fetch(`/api/events/${currentEventId}/submit`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.ok) {
      playSuccessChime();
      statusEl.className = 'success';
      statusEl.textContent = 'Drop submitted! Awaiting admin approval.';
      setTimeout(closeSubmitModal, 2000);
    } else {
      statusEl.className = 'error';
      statusEl.textContent = data.error || 'Submission failed.';
    }
  } catch {
    statusEl.className = 'error';
    statusEl.textContent = 'Network error — please try again.';
  }
}

// ── RSN Autocomplete ────────────────────────────────────────

function rsnInput(query) {
  const suggestionsEl = document.getElementById('rsn-suggestions');
  suggestionsEl.innerHTML = '';
  const q = query.trim().toLowerCase();
  if (!q || !currentBoard?.members?.length) { suggestionsEl.style.display = 'none'; return; }

  const matches = currentBoard.members.filter(m => m.player_name.toLowerCase().startsWith(q));
  if (!matches.length) { suggestionsEl.style.display = 'none'; return; }

  const teamMap = {};
  (currentBoard?.teams || []).forEach(t => { teamMap[t.team_number] = t; });

  matches.forEach(m => {
    const team = teamMap[m.team];
    const teamName = team ? team.team_name : `Team ${m.team}`;
    const color = teamColor(m.team);
    const div = document.createElement('div');
    div.className = 'rsn-suggestion';
    div.innerHTML = `<span class="rsn-suggestion-name">${escHtml(m.player_name)}</span><span class="rsn-suggestion-team" style="background:${color}22;color:${color}">${escHtml(teamName)}</span>`;
    div.addEventListener('mousedown', e => {
      e.preventDefault();
      document.getElementById('f-player').value = m.player_name;
      document.getElementById('f-team').value = m.team;
      suggestionsEl.style.display = 'none';
    });
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.style.display = 'block';
}

function rsnBlur() {
  setTimeout(() => {
    const el = document.getElementById('rsn-suggestions');
    if (el) el.style.display = 'none';
  }, 150);
}

// ── Live Feed ───────────────────────────────────────────────

function timeAgo(dateStr) {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function loadFeed() {
  if (!currentEventId) return;
  const res = await fetch(`/api/events/${currentEventId}/feed`);
  if (!res.ok) return;
  const entries = await res.json();
  const list = document.getElementById('feed-list');
  if (!entries.length) {
    list.innerHTML = '<p class="feed-empty">No approved drops yet.</p>';
    return;
  }
  const teamMap = {};
  (currentBoard?.teams || []).forEach(t => { teamMap[t.team_number] = t; });
  list.innerHTML = entries.map(e => {
    const team = teamMap[e.team];
    const teamName = team ? team.team_name : `Team ${e.team}`;
    const color = teamColor(e.team);
    return `<div class="feed-entry">
      <div class="feed-item-row">
        <img src="${itemSpriteUrl(e.item_name, e.wiki_image)}" class="feed-sprite" onerror="this.style.display='none'" alt="">
        <span class="feed-item-name">${escHtml(e.item_name)}</span>
      </div>
      <div class="feed-meta">
        <span style="color:${color};font-weight:600;">${escHtml(teamName)}</span>
        <span class="feed-player"> · ${escHtml(e.player_name)}</span>
      </div>
      <div class="feed-time">${timeAgo(e.created_at)}</div>
    </div>`;
  }).join('');
}

setInterval(() => { if (currentEventId) loadFeed(); }, 60000);

function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch {}
}

// ── Timer ────────────────────────────────────────────────────
function renderBingoTimer() {
  const card = document.getElementById('timer-center-card');
  const digits = document.getElementById('timer-center-digits');
  if (!card || !digits) return;
  const s = _timerState;
  if (!s || (s.timer_remaining_ms == null && !s.timer_end)) {
    card.style.display = 'none'; return;
  }
  let ms;
  if (s.timer_running && s.timer_end) {
    ms = Math.max(0, new Date(s.timer_end).getTime() - Date.now());
  } else {
    ms = s.timer_remaining_ms || 0;
  }
  if (ms <= 0 && !s.timer_running) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  const totalSec = Math.ceil(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(d + 'd');
  parts.push(String(h).padStart(2,'0') + 'h');
  parts.push(String(m).padStart(2,'0') + 'm');
  digits.textContent = parts.join(' ');
  digits.style.color = (ms < 3600000 && ms > 0) ? '#e05050' : '#c89b3c';
}

async function loadBingoTimer(eventId) {
  try {
    const res = await fetch(`/api/events/${eventId}/timer`);
    if (res.ok) { _timerState = await res.json(); renderBingoTimer(); }
  } catch {}
}

socket.on('timer-update', (state) => {
  if (String(state.event_id) !== String(currentEventId)) return;
  _timerState = state;
  renderBingoTimer();
});

setInterval(() => { if (_timerState?.timer_running) renderBingoTimer(); }, 30000);

loadEvents().then(() => {
  const params = new URLSearchParams(location.search);
  const eventId = params.get('event');
  if (eventId) landingSelectEvent(eventId);
});
