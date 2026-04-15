import http from 'http';
import app from './app';
import connectDB from './config/db';
import { initSocket } from './socket';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const server = http.createServer(app);

// Bootstrap async so we can await socket init (needed to get a real io instance)
(async () => {
  try {
    const io = await initSocket(server);
    app.set('io', io);

    // Bind the port before Mongo connects so the client gets HTTP (e.g. 503) instead of "connection refused"
    // while Atlas is slow or unreachable; see `db.ts` + `MONGODB_URI=in-memory` for local dev.
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server is listening on port ${PORT}`);
    });

    await connectDB();
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
})();
