import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDatabase } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.resolve(__dirname, '../../../EES_2nd_Year_2nd_Semester_Timetable.csv');

export async function runSeed() {
  console.log('Seeding Timetable data from CSV...');
  await db.runAsync('DELETE FROM timetable');

  if (!fs.existsSync(csvPath)) {
    console.error('Timetable CSV not found at:', csvPath);
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').map(line => line.trim()).filter(Boolean);
  
  if (lines.length === 0) {
    console.error('Empty Timetable CSV.');
    return;
  }

  // Header: Time,Monday,Tuesday,Wednesday,Thursday,Friday
  const headers = lines[0].split(',').map(h => h.trim());
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  for (let i = 1; i < lines.length; i++) {
    // Basic CSV splitting, handles quotes if present, but since our CSV is simple comma-separated, split works
    const cells = lines[i].split(',').map(c => c.trim());
    if (cells.length < 2) continue;

    const timeSlot = cells[0];
    // Skip Break slots
    if (timeSlot.toLowerCase().includes('break') || cells[1].toLowerCase().includes('break')) {
      continue;
    }

    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const dayName = days[dayIdx];
      const cellValue = cells[dayIdx + 1]; // +1 because index 0 is Time

      if (!cellValue || cellValue.trim() === '') continue;
      if (cellValue.toUpperCase().includes('BREAK')) continue;

      // Extract subject and location
      let subject = cellValue;
      let location = '';

      // Try to parse location e.g. "MAT Tutorials (C1)", "EES 2022 Statistical Methods (@BLC)", "PHY 2012 Optics I (@ P1)"
      if (subject.includes('(@')) {
        const parts = subject.split('(@');
        subject = parts[0].trim();
        location = parts[1].replace(')', '').trim();
      } else if (subject.includes('@')) {
        const parts = subject.split('@');
        subject = parts[0].trim();
        location = parts[1].trim();
      } else if (subject.includes('(')) {
        const parts = subject.split('(');
        subject = parts[0].trim();
        location = parts[1].replace(')', '').trim();
      }

      await db.runAsync(
        'INSERT INTO timetable (day_of_week, time_slot, subject_name, location) VALUES (?, ?, ?, ?)',
        [dayName, timeSlot, subject, location]
      );
    }
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
