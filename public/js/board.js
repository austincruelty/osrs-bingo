const socket = io();
let currentEventId = null;
let currentBoard = null;
let tilesData = [];

const eventSelect = document.getElementById('event-select');
const boardEl = document.getElementById('board');
const statusBar = document.getElementById('status-bar');

// Load events into dropdown
async function loadEvents() {
  const res = await fetch('/api/admin/events');
  const events = await res.json();
  events.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = `${ev.name} (${ev.status})`;
    eventSelect.appendChild(opt);
  });
}

eventSelect.addEventListener('change', () => {
  if (currentEventId) socket.emit('leave-event', currentEventId);
  currentEventId = eventSelect.value || null;
  if (currentEventId) {
    socket.emit('join-event', currentEventId);
    loadBoard();
    loadTilesForModal();
  } else {
    boardEl.innerHTML = '';
    document.getElementById('scoreboard').style.display = 'none';
  }
});

socket.on('board-update', ({ eventId }) => {
  if (String(eventId) === String(currentEventId)) {
    loadBoard();
  }
});

async function loadBoard() {
  if (!currentEventId) return;
  const res = await fetch(`/api/events/${currentEventId}/board`);
  if (!res.ok) { statusBar.textContent = 'Failed to load board.'; return; }
  const data = await res.json();
  currentBoard = data;
  renderBoard(data);
}

function renderBoard(data) {
  const { event, tiles, team1_bingo, team2_bingo } = data;

  document.title = `${event.name} — OSRS Bingo`;
  document.getElementById('team1-name').textContent = event.team1_name;
  document.getElementById('team2-name').textContent = event.team2_name;
  document.getElementById('legend-t1').textContent = `${event.team1_name} done`;
  document.getElementById('legend-t2').textContent = `${event.team2_name} done`;
  document.getElementById('f-team1-opt').textContent = event.team1_name;
  document.getElementById('f-team2-opt').textContent = event.team2_name;
  document.getElementById('scoreboard').style.display = 'flex';

  const t1Tiles = tiles.filter(t => t.team1_complete).length;
  const t2Tiles = tiles.filter(t => t.team2_complete).length;
  document.getElementById('team1-tiles').textContent = t1Tiles;
  document.getElementById('team2-tiles').textContent = t2Tiles;

  const t1Card = document.getElementById('team1-card');
  const t2Card = document.getElementById('team2-card');
  t1Card.classList.toggle('bingo', team1_bingo);
  t2Card.classList.toggle('bingo', team2_bingo);
  document.getElementById('team1-name').innerHTML = event.team1_name + (team1_bingo ? ' <span class="bingo-badge">BINGO!</span>' : '');
  document.getElementById('team2-name').innerHTML = event.team2_name + (team2_bingo ? ' <span class="bingo-badge">BINGO!</span>' : '');

  // Determine grid size
  let maxRow = 0, maxCol = 0;
  tiles.forEach(t => { if (t.row > maxRow) maxRow = t.row; if (t.col > maxCol) maxCol = t.col; });
  const cols = maxCol + 1;
  const rows = maxRow + 1;

  boardEl.style.gridTemplateColumns = `repeat(${cols}, minmax(130px, 1fr))`;
  boardEl.innerHTML = '';

  // Build grid map
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
      if (tile.team1_complete) el.classList.add('team1-complete');
      if (tile.team2_complete) el.classList.add('team2-complete');
      if (tile.team1_complete && tile.team2_complete) el.classList.add('both-complete');

      el.innerHTML = `<div class="tile-name">${escHtml(tile.tile_name)}</div>` +
        tile.items.map(item => `
          <div class="tile-item">
            <span class="tile-item-name">${escHtml(item.item_name)}</span>
            <span class="team-dots">
              <span class="dot${item.team1_done ? ' t1-done' : ''}" title="${escHtml(event.team1_name)}"></span>
              <span class="dot${item.team2_done ? ' t2-done' : ''}" title="${escHtml(event.team2_name)}"></span>
            </span>
          </div>
        `).join('');

      boardEl.appendChild(el);
    }
  }

  statusBar.textContent = `${event.name} — ${event.status} — ${tiles.length} tiles`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Submit modal ---
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
  tile.items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.item_name;
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
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = 'Network error — please try again.';
  }
}

loadEvents();
