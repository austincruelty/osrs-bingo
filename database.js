const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = (() => {
  const preferred = process.env.DATA_DIR;
  if (preferred) {
    try { fs.accessSync(preferred, fs.constants.W_OK); return preferred; } catch {}
  }
  return __dirname;
})();
const DB_PATH = path.join(DATA_DIR, 'bingo.db');

let _db = null;
let _saveTimer = null;

function persist() {
  if (!_db) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const data = _db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }, 200);
}

const db = {
  exec(sql) {
    _db.run(sql);
    persist();
  },

  get(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    let row = null;
    // Call getAsObject() with NO args to avoid re-binding which resets the statement
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
  },

  all(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    // Call getAsObject() with NO args — passing {} would re-bind and cause infinite loops
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  },

  run(sql, params = []) {
    _db.run(sql, params);
    const idRow = _db.exec('SELECT last_insert_rowid() as id');
    const lastInsertRowid = idRow[0]?.values[0]?.[0] ?? null;
    persist();
    return { lastInsertRowid };
  },

  transaction(fn) {
    return function(...args) {
      _db.run('BEGIN');
      try {
        const result = fn(...args);
        _db.run('COMMIT');
        persist();
        return result;
      } catch (err) {
        _db.run('ROLLBACK');
        throw err;
      }
    };
  }
};

async function init() {
  const SQL = await initSqlJs();
  const fileBuffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  _db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

  _db.run('PRAGMA foreign_keys = ON');

  _db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code_word TEXT NOT NULL,
    team1_name TEXT NOT NULL DEFAULT 'Team 1',
    team2_name TEXT NOT NULL DEFAULT 'Team 2',
    status TEXT NOT NULL DEFAULT 'active',
    rules TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Migration: add rules column to existing databases
  try { _db.run('ALTER TABLE events ADD COLUMN rules TEXT'); } catch {}

  _db.run(`CREATE TABLE IF NOT EXISTS tiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    row INTEGER NOT NULL,
    col INTEGER NOT NULL,
    tile_name TEXT NOT NULL,
    UNIQUE(event_id, row, col)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS tile_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tile_id INTEGER NOT NULL REFERENCES tiles(id),
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    wiki_image TEXT,
    group_id INTEGER
  )`);
  // Migrations
  try { _db.run('ALTER TABLE tile_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { _db.run('ALTER TABLE tile_items ADD COLUMN wiki_image TEXT'); } catch {}
  try { _db.run('ALTER TABLE tile_items ADD COLUMN group_id INTEGER'); } catch {}

  _db.run(`CREATE TABLE IF NOT EXISTS tile_item_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tile_id INTEGER NOT NULL REFERENCES tiles(id),
    group_name TEXT NOT NULL,
    target_count INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    tile_id INTEGER NOT NULL REFERENCES tiles(id),
    tile_item_id INTEGER NOT NULL REFERENCES tile_items(id),
    team INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    screenshot_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    team INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    UNIQUE(event_id, player_name)
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS event_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    team_number INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    UNIQUE(event_id, team_number)
  )`);

  // ── Gamemode templates ──────────────────────────────────────
  _db.run(`CREATE TABLE IF NOT EXISTS gamemodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS gamemode_tiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gamemode_id INTEGER NOT NULL REFERENCES gamemodes(id),
    row INTEGER NOT NULL,
    col INTEGER NOT NULL,
    tile_name TEXT NOT NULL
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS gamemode_tile_item_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tile_id INTEGER NOT NULL REFERENCES gamemode_tiles(id),
    group_name TEXT NOT NULL,
    target_count INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0
  )`);

  _db.run(`CREATE TABLE IF NOT EXISTS gamemode_tile_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tile_id INTEGER NOT NULL REFERENCES gamemode_tiles(id),
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    wiki_image TEXT,
    group_id INTEGER
  )`);

  // Seed event_teams from existing team1_name/team2_name columns (idempotent — UNIQUE constraint skips duplicates)
  try {
    const rows = db.all('SELECT id, team1_name, team2_name FROM events');
    for (const ev of rows) {
      try { db.run('INSERT INTO event_teams (event_id, team_number, team_name) VALUES (?, 1, ?)', [ev.id, ev.team1_name || 'Team 1']); } catch {}
      try { db.run('INSERT INTO event_teams (event_id, team_number, team_name) VALUES (?, 2, ?)', [ev.id, ev.team2_name || 'Team 2']); } catch {}
    }
  } catch {}

  return db;
}

module.exports = { db, init };
