import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

type MemoryServer = import('mongodb-memory-server').MongoMemoryServer;

let memoryServer: MemoryServer | null = null;

/**
 * Local dev: set `MONGODB_URI=in-memory` (or leave it unset in non-production) to use
 * mongodb-memory-server when you cannot reach Atlas (DNS/firewall timeouts).
 * Production must set a real `MONGODB_URI`.
 */
const connectDB = async () => {
  try {
    let uri = process.env.MONGODB_URI?.trim();
    const isProd = process.env.NODE_ENV === 'production';

    const wantMemory =
      !uri ||
      /^in-?memory$/i.test(uri) ||
      /^memory$/i.test(uri);

    if (wantMemory) {
      if (isProd) {
        throw new Error('MONGODB_URI must be set to a real MongoDB URI in production (in-memory is disabled).');
      }
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri();
      // eslint-disable-next-line no-console
      console.warn(
        '[db] Using ephemeral in-memory MongoDB. Data is lost when the server stops. For persistence set MONGODB_URI to Atlas or mongodb://127.0.0.1:27017/yourdb'
      );
    }

    if (!uri) {
      throw new Error('MONGODB_URI is not defined');
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 20_000,
      socketTimeoutMS: 45_000,
      // Helps some Windows / ISP setups where IPv6 DNS for SRV fails
      family: 4,
    });
    // eslint-disable-next-line no-console
    console.log('MongoDB connected successfully');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('MongoDB connection error:', error);
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error(
        '[db] Local fix: set MONGODB_URI=in-memory in backend/.env (see .env.example), or run MongoDB locally and use mongodb://127.0.0.1:27017/chat-app'
      );
    }
    process.exit(1);
  }
};

export default connectDB;
