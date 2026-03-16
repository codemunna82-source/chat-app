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

    await connectDB();

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
})();
