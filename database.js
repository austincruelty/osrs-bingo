const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || __dirname;
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

// Thin wrapper so routes can use a better-sqlite3-like API
const db = {
  exec(sql) {
    _db.run(sql);
    persist();
  },

  get(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject({});
    stmt.free();
    return row;
  },

  all(sql, params = []) {
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject({}));
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

  // Simple transaction: runs fn(), rolls back on error
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

  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA foreign_keys = ON');

  _db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code_word TEXT NOT NULL,
    team1_name TEXT NOT NULL DEFAULT 'Team 1',
    team2_name TEXT NOT NULL DEFAULT 'Team 2',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

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
    item_name TEXT NOT NULL
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

  return db;
}

module.exports = { db, init };
