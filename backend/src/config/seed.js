import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDatabase } from './db.js';
import { parseTimetableCsv } from '../utils/timetable.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = process.env.TIMETABLE_CSV || path.resolve(__dirname, '../../../EES_2nd_Year_2nd_Semester_Timetable.csv');

export async function runSeed() {
  console.log('Seeding Timetable data from CSV...');
  await db.runAsync('DELETE FROM timetable');

  if (!fs.existsSync(csvPath)) {
    console.error('Timetable CSV not found at:', csvPath);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const entries = parseTimetableCsv(csvContent);

  if (entries.length === 0) {
    console.error('Empty Timetable CSV.');
    return;
  }

  for (const entry of entries) {
    await db.runAsync(
      'INSERT INTO timetable (day_of_week, time_slot, subject_name, location) VALUES (?, ?, ?, ?)',
      [entry.day, entry.timeSlot, entry.subject, entry.location]
    );
  }

  console.log('Timetable seeded successfully.');
}

// If run directly
const isDirectRun = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isDirectRun) {
  (async () => {
    try {
      await initDatabase();
      await runSeed();
      console.log('Seed process completed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('Seed process failed:', err);
      process.exit(1);
    }
  })();
}
