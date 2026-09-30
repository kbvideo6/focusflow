#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import db, { initDatabase } from '../config/db.js';

// Helper: Run SQL as a promise
const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function main() {
  await initDatabase();

  console.log('\n======================================================');
  console.log('       FOCUSFLOW DEVELOPER DATABASE & ACTIVITY VIEW    ');
  console.log('======================================================\n');

  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'database.sqlite');
  let dbSize = '0 MB';
  try {
    if (fs.existsSync(dbPath)) {
      dbSize = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2) + ' MB';
    }
  } catch {}

  console.log(`Database Location : ${dbPath}`);
  console.log(`Database Size     : ${dbSize}`);
  console.log(`Node Environment  : ${process.env.NODE_ENV || 'production'}\n`);

  // System Counts
  const counts = await getQuery(`
    SELECT 
      (SELECT COUNT(*) FROM users) as users,
      (SELECT COUNT(*) FROM subjects) as subjects,
      (SELECT COUNT(*) FROM attendance_logs) as attendance,
      (SELECT COUNT(*) FROM transactions) as transactions,
      (SELECT COALESCE(SUM(amount), 0) FROM transactions) as total_spent,
      (SELECT COUNT(*) FROM gym_daily_logs) as gym,
      (SELECT COUNT(*) FROM skincare_logs) as skincare,
      (SELECT COUNT(*) FROM projects) as projects,
      (SELECT COUNT(*) FROM courses) as courses
  `);

  console.log('--- SYSTEM OVERVIEW ---');
  console.table([{
    'Total Users': counts.users,
    'Subjects': counts.subjects,
    'Attendance Logs': counts.attendance,
    'Transactions': counts.transactions,
    'Total Spent (LKR)': counts.total_spent,
    'Gym Logs': counts.gym,
    'Skincare Logs': counts.skincare,
    'Projects': counts.projects,
    'Courses': counts.courses
  }]);

  // All Users Summary Table
  const users = await allQuery(`
    SELECT 
      u.id as ID,
      u.username as Username,
      CASE WHEN u.is_admin = 1 THEN 'YES (Admin)' ELSE 'No' END as Admin,
      u.created_at as 'Joined On',
      (SELECT COUNT(*) FROM subjects WHERE user_id = u.id) as Subjects,
      (SELECT COUNT(*) FROM attendance_logs al JOIN subjects s ON al.subject_id = s.id WHERE s.user_id = u.id) as 'Attendance Logs',
      (SELECT COUNT(*) FROM transactions WHERE user_id = u.id) as 'Transactions',
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = u.id) as 'Spent (LKR)',
      (SELECT COUNT(*) FROM gym_daily_logs WHERE user_id = u.id) as 'Gym Days',
      (SELECT COUNT(*) FROM projects WHERE user_id = u.id) as Projects
    FROM users u
    ORDER BY u.id ASC
  `);

  console.log('\n--- ALL REGISTERED USERS & ACTIVITY METRICS ---');
  if (users.length > 0) {
    console.table(users);
  } else {
    console.log('No users found in database.');
  }

  // Recent 20 Activities
  const recent = await allQuery(`
    SELECT * FROM (
      SELECT 
        al.date as Date,
        u.username as User,
        'Attendance' as Module,
        'Marked ' || al.status || ' for ' || (CASE WHEN s.name LIKE '%:%' THEN 'Subject #' || s.id ELSE s.name END) as Details,
        al.id as sort_id
      FROM attendance_logs al
      JOIN subjects s ON al.subject_id = s.id
      JOIN users u ON s.user_id = u.id

      UNION ALL

      SELECT 
        t.date as Date,
        u.username as User,
        'Finance' as Module,
        'Spent LKR ' || t.amount || ' on ' || t.category || CASE WHEN t.description IS NOT NULL AND t.description != '' THEN ' (' || t.description || ')' ELSE '' END as Details,
        t.id as sort_id
      FROM transactions t
      JOIN users u ON t.user_id = u.id

      UNION ALL

      SELECT 
        g.date as Date,
        u.username as User,
        'Gym' as Module,
        'Logged workout' || CASE WHEN g.workout_summary IS NOT NULL AND g.workout_summary != '' THEN ': ' || g.workout_summary ELSE '' END as Details,
        g.id as sort_id
      FROM gym_daily_logs g
      JOIN users u ON g.user_id = u.id

      UNION ALL

      SELECT 
        sk.date as Date,
        u.username as User,
        'Skincare' as Module,
        sk.routine_type || ' routine (rating: ' || sk.skin_rating || '/5)' as Details,
        sk.id as sort_id
      FROM skincare_logs sk
      JOIN users u ON sk.user_id = u.id

      UNION ALL

      SELECT 
        COALESCE(p.due_date, datetime('now')) as Date,
        u.username as User,
        'Project' as Module,
        p.name || ' [' || p.status || ']' as Details,
        p.id as sort_id
      FROM projects p
      JOIN users u ON p.user_id = u.id
    )
    ORDER BY Date DESC, sort_id DESC
    LIMIT 20
  `);

  console.log('\n--- RECENT ACTIVITY STREAM (LATEST 20 ACTIONS) ---');
  if (recent.length > 0) {
    console.table(recent.map(r => ({
      Date: r.Date,
      User: r.User,
      Module: r.Module,
      Details: r.Details
    })));
  } else {
    console.log('No recent activity recorded yet.');
  }

  console.log('\n======================================================');
  console.log('To query SQLite directly on VPS:');
  console.log('  sqlite3 /app/data/database.sqlite');
  console.log('Or from outside Docker:');
  console.log('  docker exec -it focusflow-backend npm run db:activity');
  console.log('======================================================\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Failed to run developer activity view:', err);
  process.exit(1);
});
