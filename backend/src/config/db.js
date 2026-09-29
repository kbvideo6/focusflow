import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../database.sqlite');
console.log('Connecting to database at:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Promisify database methods for cleaner async/await usage
db.runAsync = promisify(db.run.bind(db));
db.allAsync = promisify(db.all.bind(db));
db.getAsync = promisify(db.get.bind(db));

export async function initDatabase() {
  // Enable foreign keys
  await db.runAsync('PRAGMA foreign_keys = ON');

  // Users table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      monthly_budget_limit REAL DEFAULT 30000.0,
      daily_budget_limit REAL DEFAULT 1000.0,
      attendance_target_pct REAL DEFAULT 80.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Subjects table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      attendance_target REAL DEFAULT 80.0,
      attendance_target_required INTEGER DEFAULT 1, -- 0 = false, 1 = true
      priority TEXT DEFAULT 'Medium', -- 'High', 'Medium', 'Low'
      effort_needed TEXT DEFAULT 'Medium', -- 'High', 'Medium', 'Low'
      projected_grade TEXT DEFAULT 'A',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    )
  `);

  // Attendance Logs table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      date TEXT NOT NULL, -- YYYY-MM-DD
      status TEXT CHECK(status IN ('present', 'absent', 'medical', 'cancelled')) NOT NULL,
      notes TEXT,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    )
  `);

  // Migration: Ensure notes column exists in case db was already created
  try {
    await db.runAsync('ALTER TABLE attendance_logs ADD COLUMN notes TEXT');
  } catch (err) {
    // Column already exists
  }

  // Migration: Support 'cancelled' status in check constraint
  try {
    const tableInfo = await db.getAsync("SELECT sql FROM sqlite_master WHERE type='table' AND name='attendance_logs'");
    if (tableInfo && tableInfo.sql) {
      const sql = tableInfo.sql;
      if (!sql.includes("'cancelled'")) {
        console.log("Migrating attendance_logs table to support 'cancelled' status...");
        await db.runAsync('PRAGMA foreign_keys = OFF');
        await db.runAsync('ALTER TABLE attendance_logs RENAME TO attendance_logs_old');
        await db.runAsync(`
          CREATE TABLE attendance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            status TEXT CHECK(status IN ('present', 'absent', 'medical', 'cancelled')) NOT NULL,
            notes TEXT,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
          )
        `);
        await db.runAsync('INSERT INTO attendance_logs (id, subject_id, date, status, notes) SELECT id, subject_id, date, status, notes FROM attendance_logs_old');
        await db.runAsync('DROP TABLE attendance_logs_old');
        await db.runAsync('PRAGMA foreign_keys = ON');
        console.log("Migration of attendance_logs table completed successfully.");
      }
    }
  } catch (err) {
    console.error("Failed migrating attendance_logs table:", err);
    await db.runAsync('PRAGMA foreign_keys = ON');
  }

  // Transactions table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL, -- YYYY-MM-DD
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Gym Daily Health Logs table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS gym_daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT UNIQUE NOT NULL, -- YYYY-MM-DD
      visited INTEGER DEFAULT 0, -- 0 = false, 1 = true
      water_intake_ml INTEGER DEFAULT 0,
      sleep_hours REAL DEFAULT 0.0,
      workout_summary TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Workout Templates table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    )
  `);

  // Workout Exercises table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS workout_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
    )
  `);

  // Workout Logs (Reps, Sets, Weight) table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL, -- YYYY-MM-DD
      exercise_name TEXT NOT NULL,
      sets TEXT NOT NULL, -- JSON string containing array of {reps, weight}
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Skincare Logs table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS skincare_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL, -- YYYY-MM-DD
      routine_type TEXT CHECK(routine_type IN ('morning', 'night')) NOT NULL,
      completed_items TEXT NOT NULL, -- JSON string array of completed items
      skin_rating INTEGER DEFAULT 4, -- 1-5 scale
      notes TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, date, routine_type)
    )
  `);

  // Projects table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
      due_date TEXT,
      priority TEXT DEFAULT 'Medium',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Courses table
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      platform TEXT NOT NULL, -- 'Udemy', 'FreeCodeCamp', 'AI Course', etc.
      progress_pct INTEGER DEFAULT 0,
      hours_studied REAL DEFAULT 0.0,
      notes TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Timetable table (User-specific)
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      day_of_week TEXT CHECK(day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')) NOT NULL,
      time_slot TEXT NOT NULL, -- e.g. "8.00 - 8.50"
      subject_name TEXT NOT NULL,
      location TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migration: Ensure user_id column exists in timetable table
  try {
    await db.runAsync('ALTER TABLE timetable ADD COLUMN user_id INTEGER');
  } catch (err) {
    // Column already exists
  }

  console.log('Database tables verified/created successfully.');
}

export default db;
