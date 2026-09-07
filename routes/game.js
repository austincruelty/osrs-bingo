const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../database');

const client = new Anthropic();

const DATA_DIR = (() => {
  const preferred = process.env.DATA_DIR;
  if (preferred) {
    try { fs.mkdirSync(path.join(preferred, 'uploads'), { recursive: true }); return preferred; } catch {}
  }
  return path.join(__dirname, '..');
})();
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

function checkBingo(tiles, team) {
  const key = team === 1 ? 'team1_complete' : 'team2_complete';
  const grid = {};
  let maxRow = 0, maxCol = 0;
  for (const t of tiles) {
    grid[`${t.row},${t.col}`] = t[key];
    if (t.row > maxRow) maxRow = t.row;
    if (t.col > maxCol) maxCol = t.col;
  }
  for (let r = 0; r <= maxRow; r++) {
    if (Array.from({ length: maxCol + 1 }, (_, c) => grid[`${r},${c}`]).every(Boolean)) return true;
  }
  for (let c = 0; c <= maxCol; c++) {
    if (Array.from({ length: maxRow + 1 }, (_, r) => grid[`${r},${c}`]).every(Boolean)) return true;
  }
  if (maxRow === maxCol) {
    const n = maxRow;
    if (Array.from({ length: n + 1 }, (_, i) => grid[`${i},${i}`]).every(Boolean)) return true;
    if (Array.from({ length: n + 1 }, (_, i) => grid[`${i},${n - i}`]).every(Boolean)) return true;
  }
  return false;
}

function buildBoard(eventId) {
  const event = db.get('SELECT * FROM events WHERE id = ?', [eventId]);
  if (!event) return null;

  const tiles = db.all('SELECT * FROM tiles WHERE event_id = ? ORDER BY row, col', [eventId]);

  const boardTiles = tiles.map(tile => {
    const items = db.all('SELECT * FROM tile_items WHERE tile_id = ?', [tile.id]);
    const itemsWithProgress = items.map(item => {
      const t1 = db.get("SELECT id FROM submissions WHERE tile_item_id = ? AND team = 1 AND status = 'approved'", [item.id]);
      const t2 = db.get("SELECT id FROM submissions WHERE tile_item_id = ? AND team = 2 AND status = 'approved'", [item.id]);
      return { ...item, team1_done: !!t1, team2_done: !!t2 };
    });
    return {
      ...tile,
      items: itemsWithProgress,
      team1_complete: itemsWithProgress.length > 0 && itemsWithProgress.every(i => i.team1_done),
      team2_complete: itemsWithProgress.length > 0 && itemsWithProgress.every(i => i.team2_done)
    };
  });

  return {
    event,
    tiles: boardTiles,
    team1_bingo: checkBingo(boardTiles, 1),
    team2_bingo: checkBingo(boardTiles, 2)
  };
}

module.exports = function makeGameRouter(broadcast) {
  const router = express.Router();

  router.get('/events/:id/board', (req, res) => {
    const board = buildBoard(req.params.id);
    if (!board) return res.status(404).json({ error: 'Event not found' });
    res.json(board);
  });

  router.get('/events/:id/tiles', (req, res) => {
    const tiles = db.all('SELECT * FROM tiles WHERE event_id = ? ORDER BY row, col', [req.params.id]);
    res.json(tiles.map(tile => ({
      ...tile,
      items: db.all('SELECT * FROM tile_items WHERE tile_id = ?', [tile.id])
    })));
  });

  router.post('/events/:id/submit', upload.single('screenshot'), async (req, res) => {
    const { player_name, team, tile_item_id } = req.body;
    const cleanup = () => { if (req.file) try { fs.unlinkSync(req.file.path); } catch {} };

    if (!player_name || !team || !tile_item_id || !req.file) {
      cleanup();
      return res.status(400).json({ error: 'player_name, team, tile_item_id, and screenshot are required' });
    }

    const teamNum = parseInt(team);
    if (teamNum !== 1 && teamNum !== 2) {
      cleanup();
      return res.status(400).json({ error: 'team must be 1 or 2' });
    }

    const event = db.get('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (!event || event.status !== 'active') {
      cleanup();
      return res.status(400).json({ error: 'Event not found or not active' });
    }

    const tileItem = db.get(`
      SELECT ti.*, t.event_id, t.id as tile_id
      FROM tile_items ti
      JOIN tiles t ON t.id = ti.tile_id
      WHERE ti.id = ? AND t.event_id = ?
    `, [tile_item_id, req.params.id]);

    if (!tileItem) {
      cleanup();
      return res.status(400).json({ error: 'Invalid tile item for this event' });
    }

    const alreadyApproved = db.get(
      "SELECT id FROM submissions WHERE tile_item_id = ? AND team = ? AND status = 'approved'",
      [tile_item_id, teamNum]
    );
    if (alreadyApproved) {
      cleanup();
      return res.status(400).json({ error: 'Your team already completed this item' });
    }

    // Verify code word with Claude vision
    try {
      const imageData = fs.readFileSync(req.file.path).toString('base64');
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: imageData } },
            { type: 'text', text: `This is an Old School RuneScape screenshot. Does the text "${event.code_word}" appear anywhere in this image? Look at all visible text including chat messages, item names, overlays, notifications, and player names. Reply with exactly "YES" or "NO" followed by a brief explanation.` }
          ]
        }]
      });

      const answer = response.content[0].text.trim();
      if (!answer.toUpperCase().startsWith('YES')) {
        cleanup();
        return res.status(400).json({
          error: `Code word "${event.code_word}" not found in your screenshot. Make sure it is visible (e.g., type it in chat before taking the screenshot).`,
          detail: answer
        });
      }
    } catch (err) {
      console.error('Claude vision error:', err.message);
      cleanup();
      return res.status(500).json({ error: 'Screenshot verification failed — please try again.' });
    }

    const screenshotPath = 'uploads/' + path.basename(req.file.path);
    const result = db.run(`
      INSERT INTO submissions (event_id, tile_id, tile_item_id, team, player_name, screenshot_path, status)
      VALUES (?, ?, ?, ?, ?, ?, 'approved')
    `, [req.params.id, tileItem.tile_id, tile_item_id, teamNum, player_name.trim(), screenshotPath]);

    broadcast(req.params.id);
    res.json({ ok: true, submissionId: result.lastInsertRowid });
  });

  return router;
};
