require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { init } = require('./database');

async function main() {
  await init(); // must resolve before routes use db

  const adminRoutes = require('./routes/admin');
  const makeGameRouter = require('./routes/game');
  const makeRouletteRouter = require('./routes/roulette');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.json());
  const DATA_DIR = process.env.DATA_DIR || __dirname;
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));

  const broadcast = (eventId) => io.to(`event-${eventId}`).emit('board-update', { eventId });
  const broadcastTimer = (eventId, timerState) => io.to(`event-${eventId}`).emit('timer-update', timerState);

  app.use('/api/admin', adminRoutes(broadcast, broadcastTimer));
  app.use('/api', makeGameRouter(broadcast));
  app.use('/api/roulette', makeRouletteRouter(broadcast));

  // Return JSON errors instead of HTML so the browser can read them
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  io.on('connection', (socket) => {
    socket.on('join-event', (eventId) => socket.join(`event-${eventId}`));
    socket.on('leave-event', (eventId) => socket.leave(`event-${eventId}`));
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`OSRS Bingo running at http://localhost:${PORT}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
