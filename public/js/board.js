const socket = io();
let currentEventId = null;
let currentBoard = null;
let tilesData = [];
let selectedTeam = null; // null = both teams, 1 = team1, 2 = team2

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

  events.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = `${ev.name} (${ev.status})`;
    eventSelect.appendChild(opt);

    const btn = document.createElement('button');
    btn.className = 'landing-event-btn';
    btn.innerHTML = `<span class="landing-event-name">${escHtml(ev.name)}</span><span class="landing-event-status ${ev.status}">${ev.status}</span>`;
    btn.addEventListener('click', () => landingSelectEvent(String(ev.id)));
    landingContainer.appendChild(btn);
  });
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
  } else {
    boardEl.innerHTML = '';
    document.getElementById('scoreboard').style.display = 'none';
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

function toggleTeamView(team) {
  // Clicking the already-active team returns to both-teams view
  selectedTeam = (selectedTeam === team) ? null : team;
  if (currentBoard) renderBoard(currentBoard);
}

function updateTeamViewBar(data) {
  const bar = document.getElementById('team-view-bar');
  const label = document.getElementById('team-view-label');
  if (selectedTeam === 1) {
    bar.style.display = 'flex';
    label.textContent = `Viewing ${data.event.team1_name}'s Board`;
    label.style.color = '#4a7fc1';
  } else if (selectedTeam === 2) {
    bar.style.display = 'flex';
    label.textContent = `Viewing ${data.event.team2_name}'s Board`;
    label.style.color = '#c85a1a';
  } else {
    bar.style.display = 'none';
  }
}

// ── Render ──────────────────────────────────────────────────

function renderBoard(data) {
  const { event, tiles, team1_bingo, team2_bingo, team1_points = 0, team2_points = 0, members = [] } = data;

  document.title = `${event.name} — Veritas Bingo`;
  document.getElementById('team1-name').textContent = event.team1_name;
  document.getElementById('team2-name').textContent = event.team2_name;
  document.getElementById('legend-t1').textContent = `${event.team1_name} done`;
  document.getElementById('legend-t2').textContent = `${event.team2_name} done`;
  document.getElementById('f-team1-opt').textContent = event.team1_name;
  document.getElementById('f-team2-opt').textContent = event.team2_name;
  document.getElementById('scoreboard').style.display = 'flex';

  const t1Tiles = tiles.filter(t => t.team1_complete).length;
  const t2Tiles = tiles.filter(t => t.team2_complete).length;

  document.getElementById('team1-pts').textContent = team1_points;
  document.getElementById('team2-pts').textContent = team2_points;
  document.getElementById('team1-tiles-sub').textContent = `${t1Tiles} tile${t1Tiles !== 1 ? 's' : ''} complete`;
  document.getElementById('team2-tiles-sub').textContent = `${t2Tiles} tile${t2Tiles !== 1 ? 's' : ''} complete`;

  // Team card active states
  const t1Card = document.getElementById('team1-card');
  const t2Card = document.getElementById('team2-card');
  t1Card.className = 'team-card' + (team1_bingo ? ' bingo' : '') + (selectedTeam === 1 ? ' active-t1' : selectedTeam === 2 ? ' dimmed' : '');
  t2Card.className = 'team-card' + (team2_bingo ? ' bingo' : '') + (selectedTeam === 2 ? ' active-t2' : selectedTeam === 1 ? ' dimmed' : '');

  document.getElementById('team1-name').innerHTML = event.team1_name + (team1_bingo ? ' <span class="bingo-badge">BINGO!</span>' : '');
  document.getElementById('team2-name').innerHTML = event.team2_name + (team2_bingo ? ' <span class="bingo-badge">BINGO!</span>' : '');

  // Roster pills
  const t1Members = members.filter(m => m.team === 1);
  const t2Members = members.filter(m => m.team === 2);
  document.getElementById('team1-roster').innerHTML = t1Members.map(m => `<span class="roster-pill">${escHtml(m.player_name)}</span>`).join('');
  document.getElementById('team2-roster').innerHTML = t2Members.map(m => `<span class="roster-pill">${escHtml(m.player_name)}</span>`).join('');

  updateTeamViewBar(data);

  // Grid setup
  let maxRow = 0, maxCol = 0;
  tiles.forEach(t => { if (t.row > maxRow) maxRow = t.row; if (t.col > maxCol) maxCol = t.col; });
  const cols = maxCol + 1;
  const rows = maxRow + 1;
  boardEl.style.gridTemplateColumns = `repeat(${cols}, minmax(130px, 1fr))`;
  boardEl.innerHTML = '';

  const tileMap = {};
  tiles.forEach(t => { tileMap[`${t.row},${t.col}`] = t; });

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

      if (selectedTeam === null) {
        // Both-teams view: show both completion states
        if (tile.team1_complete) el.classList.add('team1-complete');
        if (tile.team2_complete) el.classList.add('team2-complete');
        if (tile.team1_complete && tile.team2_complete) el.classList.add('both-complete');
      } else {
        // Single-team view
        const myComplete = selectedTeam === 1 ? tile.team1_complete : tile.team2_complete;
        const theirComplete = selectedTeam === 1 ? tile.team2_complete : tile.team1_complete;
        if (myComplete) el.classList.add(selectedTeam === 1 ? 'team1-complete' : 'team2-complete');
        if (theirComplete) el.classList.add('other-team-faint');
      }

      const headerSprite = `<img src="${itemSpriteUrl(tile.tile_name)}" class="tile-header-sprite" onerror="this.style.display='none'" alt="">`;
      el.innerHTML = `<div class="tile-header">${headerSprite}<span class="tile-name">${escHtml(tile.tile_name)}</span></div>` +
        tile.items.map(item => {
          const stars = '★'.repeat(item.points || 1);
          const qty = item.quantity || 1;
          const t1c = item.team1_count || 0;
          const t2c = item.team2_count || 0;
          const t1done = item.team1_done;
          const t2done = item.team2_done;

          // For qty > 1 show "N/total" counts; for qty=1 show dots
          let progress1 = '', progress2 = '';
          if (qty > 1) {
            if (selectedTeam === null || selectedTeam === 1)
              progress1 = `<span class="qty-progress t1-prog${t1done ? ' done' : ''}">${t1c}/${qty}</span>`;
            if (selectedTeam === null || selectedTeam === 2)
              progress2 = `<span class="qty-progress t2-prog${t2done ? ' done' : ''}">${t2c}/${qty}</span>`;
          } else {
            if (selectedTeam === null) {
              progress1 = `<span class="dot${t1done ? ' t1-done' : ''}"></span>`;
              progress2 = `<span class="dot${t2done ? ' t2-done' : ''}"></span>`;
            } else if (selectedTeam === 1) {
              progress1 = `<span class="dot${t1done ? ' t1-done' : ''}"></span>`;
            } else {
              progress2 = `<span class="dot${t2done ? ' t2-done' : ''}"></span>`;
            }
          }

          const isDone = (selectedTeam === 1 && t1done) || (selectedTeam === 2 && t2done);
          return `
            <div class="tile-item${isDone ? ' item-done' : ''}">
              <img src="${itemSpriteUrl(item.item_name)}" class="item-sprite" onerror="this.style.display='none'" alt="">
              <span class="item-stars">${escHtml(stars)}</span>
              <span class="tile-item-name">${escHtml(item.item_name)}</span>
              <span class="team-dots">${progress1}${progress2}</span>
            </div>`;
        }).join('');

      boardEl.appendChild(el);
    }
  }

  statusBar.textContent = `${event.name} · ${event.status} · ${tiles.length} tiles`;

  // Rules section
  const rulesSection = document.getElementById('rules-section');
  const rulesText = document.getElementById('rules-text');
  if (event.rules && event.rules.trim()) {
    rulesText.textContent = event.rules.trim();
    rulesSection.style.display = '';
  } else {
    rulesSection.style.display = 'none';
  }
}

function toggleRules() {
  const body = document.getElementById('rules-body');
  const icon = document.getElementById('rules-toggle-icon');
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  icon.textContent = open ? '▼' : '▶';
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function itemSpriteUrl(itemName) {
  // Strip quantity suffixes ("Dragon bones x5" → "Dragon bones") before wiki lookup
  const clean = itemName.trim().replace(/\s+x\d+$/i, '').replace(/^\d+x\s+/i, '').trim();
  const wikiName = clean.charAt(0).toUpperCase() + clean.slice(1).replace(/ /g, '_');
  return `https://oldschool.runescape.wiki/images/${encodeURIComponent(wikiName)}.png`;
}

// ── Submit modal ────────────────────────────────────────────

async function loadTilesForModal() {
  if (!currentEventId) return;
  const res = await fetch(`/api/events/${currentEventId}/tiles`);
  tilesData = await res.json();
  const tileSelect = document.getElementById('f-tile');
  tileSelect.innerHTML = '<option value="">Select tile...</option>';
  tilesData.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.tile_name;
    tileSelect.appendChild(opt);
  });
}

function populateItems() {
  const tileId = document.getElementById('f-tile').value;
  const itemSelect = document.getElementById('f-item');
  itemSelect.innerHTML = '<option value="">Select item...</option>';
  if (!tileId) return;
  const tile = tilesData.find(t => String(t.id) === String(tileId));
  if (!tile) return;
  tile.items.forEach((item, idx) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${'★'.repeat(Math.min(idx + 1, 3))} ${item.item_name}`;
    itemSelect.appendChild(opt);
  });
}

function openSubmitModal() {
  if (!currentEventId) { alert('Please select an event first.'); return; }
  document.getElementById('upload-status').textContent = '';
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
  if (!tileItemId) { statusEl.className = 'error'; statusEl.textContent = 'Select a tile and item.'; return; }
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
      statusEl.className = 'success';
      statusEl.textContent = 'Drop submitted and verified!';
      setTimeout(closeSubmitModal, 1500);
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

  const matches = currentBoard.members.filter(m =>
    m.player_name.toLowerCase().startsWith(q)
  );
  if (!matches.length) { suggestionsEl.style.display = 'none'; return; }

  matches.forEach(m => {
    const teamName = m.team === 1 ? currentBoard.event.team1_name : currentBoard.event.team2_name;
    const div = document.createElement('div');
    div.className = 'rsn-suggestion';
    div.innerHTML = `<span class="rsn-suggestion-name">${escHtml(m.player_name)}</span><span class="rsn-suggestion-team rsn-t${m.team}">${escHtml(teamName)}</span>`;
    div.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus so blur doesn't fire first
      document.getElementById('f-player').value = m.player_name;
      document.getElementById('f-team').value = m.team;
      suggestionsEl.style.display = 'none';
    });
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.style.display = 'block';
}

function rsnBlur() {
  // small delay so mousedown on a suggestion fires before blur hides it
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
  const t1name = currentBoard?.event?.team1_name || 'Team 1';
  const t2name = currentBoard?.event?.team2_name || 'Team 2';
  list.innerHTML = entries.map(e => {
    const teamName = e.team === 1 ? t1name : t2name;
    const teamClass = `feed-team-t${e.team}`;
    return `<div class="feed-entry">
      <div class="feed-item-row">
        <img src="${itemSpriteUrl(e.item_name)}" class="feed-sprite" onerror="this.style.display='none'" alt="">
        <span class="feed-item-name">${escHtml(e.item_name)}</span>
      </div>
      <div class="feed-meta">
        <span class="${teamClass}">${escHtml(teamName)}</span>
        <span class="feed-player"> · ${escHtml(e.player_name)}</span>
      </div>
      <div class="feed-time">${timeAgo(e.created_at)}</div>
    </div>`;
  }).join('');
}

// Refresh time-ago labels every minute without a full reload
setInterval(() => { if (currentEventId) loadFeed(); }, 60000);

loadEvents();
