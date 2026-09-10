const express = require('express');
const { db } = require('../database');

module.exports = function makeAdminRouter(broadcast) {
  const router = express.Router();

  router.use((req, res, next) => {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return next();
    if (req.headers['x-admin-password'] !== password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  // ── Gamemodes ────────────────────────────────────────────
  router.get('/gamemodes', (req, res) => {
    res.json(db.all('SELECT * FROM gamemodes ORDER BY created_at DESC'));
  });

  router.post('/events/:id/save-as-gamemode', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const tiles = db.all('SELECT * FROM tiles WHERE event_id = ? ORDER BY row, col', [req.params.id]);
    if (!tiles.length) return res.status(400).json({ error: 'No tiles on this board to save' });
    const save = db.transaction(() => {
      const r = db.run('INSERT INTO gamemodes (name) VALUES (?)', [name.trim()]);
      const gamemodeId = r.lastInsertRowid;
      for (const tile of tiles) {
        const tr = db.run(
          'INSERT INTO gamemode_tiles (gamemode_id, row, col, tile_name) VALUES (?, ?, ?, ?)',
          [gamemodeId, tile.row, tile.col, tile.tile_name]
        );
        const gtId = tr.lastInsertRowid;
        const groups = db.all('SELECT * FROM tile_item_groups WHERE tile_id = ? ORDER BY display_order', [tile.id]);
        const groupIdMap = {};
        for (const g of groups) {
          const gr = db.run(
            'INSERT INTO gamemode_tile_item_groups (tile_id, group_name, target_count, display_order) VALUES (?, ?, ?, ?)',
            [gtId, g.group_name, g.target_count, g.display_order]
          );
          groupIdMap[g.id] = gr.lastInsertRowid;
        }
        const items = db.all('SELECT * FROM tile_items WHERE tile_id = ?', [tile.id]);
        for (const item of items) {
          const newGroupId = item.group_id ? (groupIdMap[item.group_id] || null) : null;
          db.run(
            'INSERT INTO gamemode_tile_items (tile_id, item_name, quantity, wiki_image, group_id) VALUES (?, ?, ?, ?, ?)',
            [gtId, item.item_name, item.quantity, item.wiki_image, newGroupId]
          );
        }
      }
      return gamemodeId;
    });
    try {
      const id = save();
      res.json({ id, name: name.trim() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Events ──────────────────────────────────────────────
  router.get('/events', (req, res) => {
    const events = db.all('SELECT * FROM events ORDER BY created_at DESC');
    res.json(events.map(ev => ({
      ...ev,
      teams: db.all('SELECT team_number, team_name FROM event_teams WHERE event_id = ? ORDER BY team_number', [ev.id])
    })));
  });

  router.post('/events', (req, res) => {
    const { name, code_word, team1_name, team2_name, gamemode_id } = req.body;
    if (!name || !code_word) return res.status(400).json({ error: 'name and code_word required' });
    const result = db.run(
      'INSERT INTO events (name, code_word, team1_name, team2_name) VALUES (?, ?, ?, ?)',
      [name, code_word, team1_name || 'Team 1', team2_name || 'Team 2']
    );
    const eventId = result.lastInsertRowid;
    db.run('INSERT INTO event_teams (event_id, team_number, team_name) VALUES (?, 1, ?)', [eventId, team1_name || 'Team 1']);
    db.run('INSERT INTO event_teams (event_id, team_number, team_name) VALUES (?, 2, ?)', [eventId, team2_name || 'Team 2']);

    if (gamemode_id) {
      const gmTiles = db.all('SELECT * FROM gamemode_tiles WHERE gamemode_id = ? ORDER BY row, col', [gamemode_id]);
      for (const gmt of gmTiles) {
        const tr = db.run(
          'INSERT INTO tiles (event_id, row, col, tile_name) VALUES (?, ?, ?, ?)',
          [eventId, gmt.row, gmt.col, gmt.tile_name]
        );
        const tileId = tr.lastInsertRowid;
        const groups = db.all('SELECT * FROM gamemode_tile_item_groups WHERE tile_id = ? ORDER BY display_order', [gmt.id]);
        const groupIdMap = {};
        for (const g of groups) {
          const gr = db.run(
            'INSERT INTO tile_item_groups (tile_id, group_name, target_count, display_order) VALUES (?, ?, ?, ?)',
            [tileId, g.group_name, g.target_count, g.display_order]
          );
          groupIdMap[g.id] = gr.lastInsertRowid;
        }
        const items = db.all('SELECT * FROM gamemode_tile_items WHERE tile_id = ?', [gmt.id]);
        for (const item of items) {
          const newGroupId = item.group_id ? (groupIdMap[item.group_id] || null) : null;
          db.run(
            'INSERT INTO tile_items (tile_id, item_name, quantity, wiki_image, group_id) VALUES (?, ?, ?, ?, ?)',
            [tileId, item.item_name, item.quantity, item.wiki_image, newGroupId]
          );
        }
      }
    }

    res.json({ id: eventId });
  });

  router.patch('/events/:id', (req, res) => {
    const { status, code_word, name, rules, teams } = req.body;
    const event = db.get('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (name) db.run('UPDATE events SET name = ? WHERE id = ?', [name, req.params.id]);
    if (status) db.run('UPDATE events SET status = ? WHERE id = ?', [status, req.params.id]);
    if (code_word) db.run('UPDATE events SET code_word = ? WHERE id = ?', [code_word, req.params.id]);
    if (rules !== undefined) db.run('UPDATE events SET rules = ? WHERE id = ?', [rules || null, req.params.id]);
    if (teams && Array.isArray(teams)) {
      for (const t of teams) {
        db.run('UPDATE event_teams SET team_name = ? WHERE event_id = ? AND team_number = ?',
          [(t.team_name || '').trim() || `Team ${t.team_number}`, req.params.id, t.team_number]);
      }
    }
    broadcast(req.params.id);
    res.json({ ok: true });
  });

  // ── Teams ────────────────────────────────────────────────

  router.get('/events/:id/teams', (req, res) => {
    res.json(db.all('SELECT * FROM event_teams WHERE event_id = ? ORDER BY team_number', [req.params.id]));
  });

  router.post('/events/:id/teams', (req, res) => {
    const { team_name } = req.body;
    const existing = db.all('SELECT team_number FROM event_teams WHERE event_id = ? ORDER BY team_number', [req.params.id]);
    const nextNum = existing.length ? Math.max(...existing.map(t => t.team_number)) + 1 : 1;
    const tname = (team_name || '').trim() || `Team ${nextNum}`;
    try {
      db.run('INSERT INTO event_teams (event_id, team_number, team_name) VALUES (?, ?, ?)', [req.params.id, nextNum, tname]);
      broadcast(req.params.id);
      res.json({ team_number: nextNum, team_name: tname });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/events/:id/teams/:teamNum', (req, res) => {
    const teamNum = parseInt(req.params.teamNum);
    const hasMembers = db.get('SELECT COUNT(*) as c FROM team_members WHERE event_id = ? AND team = ?', [req.params.id, teamNum]);
    const hasSubs = db.get("SELECT COUNT(*) as c FROM submissions WHERE event_id = ? AND team = ? AND status != 'rejected'", [req.params.id, teamNum]);
    if ((hasMembers?.c || 0) > 0 || (hasSubs?.c || 0) > 0) {
      return res.status(400).json({ error: 'Cannot remove a team that has players or submissions' });
    }
    db.run('DELETE FROM event_teams WHERE event_id = ? AND team_number = ?', [req.params.id, teamNum]);
    broadcast(req.params.id);
    res.json({ ok: true });
  });

  // ── Tiles ────────────────────────────────────────────────

  router.post('/events/:id/tiles', (req, res) => {
    const { row, col, tile_name, items = [], groups = [] } = req.body;
    if (row === undefined || col === undefined || !tile_name) {
      return res.status(400).json({ error: 'row, col, and tile_name required' });
    }
    if (!items.length && !groups.length) {
      return res.status(400).json({ error: 'At least one item or pool required' });
    }

    const saveTile = db.transaction((eventId, row, col, tile_name, items, groups) => {
      const existing = db.get('SELECT id FROM tiles WHERE event_id = ? AND row = ? AND col = ?', [eventId, row, col]);
      let tileId;

      if (existing) {
        tileId = existing.id;
        db.run('UPDATE tiles SET tile_name = ? WHERE id = ?', [tile_name, tileId]);

        // ── Individual items (group_id IS NULL) ──────────────────
        const exItems = db.all('SELECT id FROM tile_items WHERE tile_id = ? AND group_id IS NULL', [tileId]);
        const exItemIds = new Set(exItems.map(i => i.id));
        const keptItemIds = new Set(items.filter(i => i.id).map(i => Number(i.id)));
        for (const ex of exItems) {
          if (!keptItemIds.has(ex.id)) {
            const hs = db.get('SELECT COUNT(*) as c FROM submissions WHERE tile_item_id = ?', [ex.id]);
            if (!(hs && hs.c > 0)) db.run('DELETE FROM tile_items WHERE id = ?', [ex.id]);
          }
        }
        for (const item of items) {
          const name = (item.name || '').trim();
          const qty = Math.max(1, parseInt(item.qty) || 1);
          const wiki = (item.wiki_image || '').trim() || null;
          if (!name) continue;
          if (item.id && exItemIds.has(Number(item.id))) {
            db.run('UPDATE tile_items SET item_name = ?, quantity = ?, wiki_image = ? WHERE id = ?', [name, qty, wiki, Number(item.id)]);
          } else {
            db.run('INSERT INTO tile_items (tile_id, item_name, quantity, wiki_image) VALUES (?, ?, ?, ?)', [tileId, name, qty, wiki]);
          }
        }

        // ── Groups ───────────────────────────────────────────────
        const exGroups = db.all('SELECT id FROM tile_item_groups WHERE tile_id = ?', [tileId]);
        const exGroupIds = new Set(exGroups.map(g => g.id));
        const keptGroupIds = new Set(groups.filter(g => g.id).map(g => Number(g.id)));
        for (const eg of exGroups) {
          if (!keptGroupIds.has(eg.id)) {
            const gItems = db.all('SELECT id FROM tile_items WHERE group_id = ?', [eg.id]);
            let safe = true;
            for (const gi of gItems) {
              const hs = db.get('SELECT COUNT(*) as c FROM submissions WHERE tile_item_id = ?', [gi.id]);
              if (hs && hs.c > 0) { safe = false; break; }
            }
            if (safe) {
              db.run('DELETE FROM tile_items WHERE group_id = ?', [eg.id]);
              db.run('DELETE FROM tile_item_groups WHERE id = ?', [eg.id]);
            }
          }
        }
        groups.forEach((g, gIdx) => {
          let groupId;
          if (g.id && exGroupIds.has(Number(g.id))) {
            groupId = Number(g.id);
            db.run('UPDATE tile_item_groups SET group_name = ?, target_count = ?, display_order = ? WHERE id = ?',
              [g.group_name, g.target_count, gIdx, groupId]);
          } else {
            const r = db.run('INSERT INTO tile_item_groups (tile_id, group_name, target_count, display_order) VALUES (?, ?, ?, ?)',
              [tileId, g.group_name, g.target_count, gIdx]);
            groupId = r.lastInsertRowid;
          }
          const exGI = db.all('SELECT id FROM tile_items WHERE group_id = ?', [groupId]);
          const exGIIds = new Set(exGI.map(i => i.id));
          const keptGIIds = new Set(g.items.filter(i => i.id).map(i => Number(i.id)));
          for (const ex of exGI) {
            if (!keptGIIds.has(ex.id)) {
              const hs = db.get('SELECT COUNT(*) as c FROM submissions WHERE tile_item_id = ?', [ex.id]);
              if (!(hs && hs.c > 0)) db.run('DELETE FROM tile_items WHERE id = ?', [ex.id]);
            }
          }
          for (const item of g.items) {
            const name = (item.name || '').trim();
            const wiki = (item.wiki_image || '').trim() || null;
            if (!name) continue;
            if (item.id && exGIIds.has(Number(item.id))) {
              db.run('UPDATE tile_items SET item_name = ?, wiki_image = ?, group_id = ? WHERE id = ?', [name, wiki, groupId, Number(item.id)]);
            } else {
              db.run('INSERT INTO tile_items (tile_id, item_name, quantity, wiki_image, group_id) VALUES (?, ?, 1, ?, ?)', [tileId, name, wiki, groupId]);
            }
          }
        });

      } else {
        const r = db.run('INSERT INTO tiles (event_id, row, col, tile_name) VALUES (?, ?, ?, ?)', [eventId, row, col, tile_name]);
        tileId = r.lastInsertRowid;
        for (const item of items) {
          const name = (item.name || '').trim();
          const qty = Math.max(1, parseInt(item.qty) || 1);
          const wiki = (item.wiki_image || '').trim() || null;
          if (name) db.run('INSERT INTO tile_items (tile_id, item_name, quantity, wiki_image) VALUES (?, ?, ?, ?)', [tileId, name, qty, wiki]);
        }
        groups.forEach((g, gIdx) => {
          const r = db.run('INSERT INTO tile_item_groups (tile_id, group_name, target_count, display_order) VALUES (?, ?, ?, ?)',
            [tileId, g.group_name, g.target_count, gIdx]);
          const groupId = r.lastInsertRowid;
          for (const item of g.items) {
            const name = (item.name || '').trim();
            const wiki = (item.wiki_image || '').trim() || null;
            if (name) db.run('INSERT INTO tile_items (tile_id, item_name, quantity, wiki_image, group_id) VALUES (?, ?, 1, ?, ?)', [tileId, name, wiki, groupId]);
          }
        });
      }
      return tileId;
    });

    const tileId = saveTile(req.params.id, row, col, tile_name, items, groups);
    broadcast(req.params.id);
    res.json({ tileId });
  });

  router.delete('/events/:id/tiles/:tileId', (req, res) => {
    const hasSubs = db.get('SELECT COUNT(*) as c FROM submissions WHERE tile_id = ?', [req.params.tileId]);
    if (hasSubs && hasSubs.c > 0) {
      return res.status(400).json({ error: 'Cannot delete a tile that has submissions. Remove the submissions first.' });
    }
    db.run('DELETE FROM tile_items WHERE tile_id = ?', [req.params.tileId]);
    db.run('DELETE FROM tile_item_groups WHERE tile_id = ?', [req.params.tileId]);
    db.run('DELETE FROM tiles WHERE id = ?', [req.params.tileId]);
    broadcast(req.params.id);
    res.json({ ok: true });
  });

  // ── Roster ───────────────────────────────────────────────

  router.get('/events/:id/members', (req, res) => {
    res.json(db.all('SELECT * FROM team_members WHERE event_id = ? ORDER BY team, player_name', [req.params.id]));
  });

  router.post('/events/:id/members', (req, res) => {
    const { player_name, team } = req.body;
    if (!player_name || !team) return res.status(400).json({ error: 'player_name and team required' });
    const validTeam = db.get('SELECT id FROM event_teams WHERE event_id = ? AND team_number = ?', [req.params.id, team]);
    if (!validTeam) return res.status(400).json({ error: 'Invalid team number for this event' });
    try {
      const result = db.run(
        'INSERT INTO team_members (event_id, team, player_name) VALUES (?, ?, ?)',
        [req.params.id, team, player_name.trim()]
      );
      res.json({ id: result.lastInsertRowid });
    } catch (err) {
      res.status(400).json({ error: 'Player already on a team for this event' });
    }
  });

  router.delete('/events/:id/members/:memberId', (req, res) => {
    db.run('DELETE FROM team_members WHERE id = ? AND event_id = ?', [req.params.memberId, req.params.id]);
    res.json({ ok: true });
  });

  // ── Submissions ───────────────────────────────────────────

  router.get('/events/:id/submissions', (req, res) => {
    const subs = db.all(`
      SELECT s.*, t.tile_name, ti.item_name, tig.group_name,
             et.team_name
      FROM submissions s
      JOIN tiles t ON t.id = s.tile_id
      JOIN tile_items ti ON ti.id = s.tile_item_id
      LEFT JOIN tile_item_groups tig ON tig.id = ti.group_id
      LEFT JOIN event_teams et ON et.event_id = s.event_id AND et.team_number = s.team
      WHERE s.event_id = ?
      ORDER BY s.created_at DESC
    `, [req.params.id]);
    res.json(subs);
  });

  router.patch('/submissions/:submissionId', (req, res) => {
    const { status, rejection_reason } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid status' });
    const sub = db.get('SELECT * FROM submissions WHERE id = ?', [req.params.submissionId]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    db.run('UPDATE submissions SET status = ?, rejection_reason = ? WHERE id = ?',
      [status, rejection_reason || null, req.params.submissionId]);
    broadcast(sub.event_id);
    res.json({ ok: true });
  });

  router.delete('/submissions/:submissionId', (req, res) => {
    const sub = db.get('SELECT * FROM submissions WHERE id = ?', [req.params.submissionId]);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    db.run('DELETE FROM submissions WHERE id = ?', [req.params.submissionId]);
    broadcast(sub.event_id);
    res.json({ ok: true });
  });

  return router;
};
