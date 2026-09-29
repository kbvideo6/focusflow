import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db, { initDatabase } from './config/db.js';
import { runSeed } from './config/seed.js';
import authRoutes from './routes/auth.js';
import trackerRoutes from './routes/tracker.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*', // Allow all origins for local development/testing
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tracker', trackerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

async function ensureInitialData() {
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM timetable', (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (!row || row.count === 0) {
      console.log('No timetable data found. Running database seeder...');
      await runSeed();
      console.log('Database seeded successfully.');
      return;
    }

    console.log('Database already has timetable data. Skipping seeder.');
  } catch (err) {
    console.error('Failed to initialize default data:', err);
    throw err;
  }
}

async function startServer() {
  try {
    await initDatabase();
    await ensureInitialData();

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialize and start server:', err);
    process.exit(1);
  }
}

startServer();
