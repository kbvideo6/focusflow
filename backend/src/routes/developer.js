import express from 'express';
import fs from 'fs';
import path from 'path';
import db from '../config/db.js';
import { verifyDeveloper } from '../middleware/developer.js';
import { decrypt } from '../utils/crypto.js';

const router = express.Router();

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

// All developer routes require verifyDeveloper
router.use(verifyDeveloper);

/**
 * 1. High-level system overview & database health
 */
router.get('/overview', async (req, res) => {
  try {
    const userCount = await getQuery('SELECT COUNT(*) as count FROM users');
    const subjectCount = await getQuery('SELECT COUNT(*) as count FROM subjects');
    const attendanceCount = await getQuery('SELECT COUNT(*) as count FROM attendance_logs');
    const transactionCount = await getQuery('SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_spent FROM transactions');
    const gymCount = await getQuery('SELECT COUNT(*) as count FROM gym_daily_logs');
    const workoutCount = await getQuery('SELECT COUNT(*) as count FROM workout_logs');
    const skincareCount = await getQuery('SELECT COUNT(*) as count FROM skincare_logs');
    const projectCount = await getQuery('SELECT COUNT(*) as count FROM projects');
    const courseCount = await getQuery('SELECT COUNT(*) as count FROM courses');
    const timetableCount = await getQuery('SELECT COUNT(*) as count FROM timetable');

    // Database file stats
    const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'database.sqlite');
    let dbSize = 0;
    try {
      if (fs.existsSync(dbPath)) {
        dbSize = fs.statSync(dbPath).size;
      }
    } catch {}

    res.json({
      database: {
        path: dbPath,
        size_bytes: dbSize,
        size_formatted: (dbSize / 1024 / 1024).toFixed(2) + ' MB'
      },
      counts: {
        users: userCount?.count || 0,
        subjects: subjectCount?.count || 0,
        attendance_logs: attendanceCount?.count || 0,
        transactions: transactionCount?.count || 0,
        total_spent: transactionCount?.total_spent || 0,
        gym_logs: gymCount?.count || 0,
        workout_logs: workoutCount?.count || 0,
        skincare_logs: skincareCount?.count || 0,
        projects: projectCount?.count || 0,
        courses: courseCount?.count || 0,
        timetable_slots: timetableCount?.count || 0
      },
      server: {
        uptime_seconds: Math.floor(process.uptime()),
        node_version: process.version,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. All users with aggregated activity metrics
 */
router.get('/users', async (req, res) => {
  try {
    const users = await allQuery(`
      SELECT 
        u.id,
        u.username,
        u.created_at,
        u.is_admin,
        u.monthly_budget_limit,
        u.daily_budget_limit,
        u.attendance_target_pct,
        (SELECT COUNT(*) FROM subjects WHERE user_id = u.id) as subjects_count,
        (SELECT COUNT(*) FROM attendance_logs al JOIN subjects s ON al.subject_id = s.id WHERE s.user_id = u.id) as attendance_logs_count,
        (SELECT COUNT(*) FROM attendance_logs al JOIN subjects s ON al.subject_id = s.id WHERE s.user_id = u.id AND al.status = 'present') as attendance_present_count,
        (SELECT COUNT(*) FROM transactions WHERE user_id = u.id) as transactions_count,
        (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = u.id) as total_spent,
        (SELECT COUNT(*) FROM gym_daily_logs WHERE user_id = u.id) as gym_logs_count,
        (SELECT COUNT(*) FROM skincare_logs WHERE user_id = u.id) as skincare_logs_count,
        (SELECT COUNT(*) FROM projects WHERE user_id = u.id) as projects_count,
        (SELECT COUNT(*) FROM courses WHERE user_id = u.id) as courses_count,
        (
          SELECT MAX(activity_date) FROM (
            SELECT date as activity_date FROM attendance_logs al JOIN subjects s ON al.subject_id = s.id WHERE s.user_id = u.id
            UNION ALL
            SELECT date as activity_date FROM transactions WHERE user_id = u.id
            UNION ALL
            SELECT date as activity_date FROM gym_daily_logs WHERE user_id = u.id
            UNION ALL
            SELECT date as activity_date FROM skincare_logs WHERE user_id = u.id
          )
        ) as last_activity_date
      FROM users u
      ORDER BY u.id ASC
    `);

    const usersWithStats = users.map(u => {
      const attendanceRate = u.attendance_logs_count > 0 
        ? Math.round((u.attendance_present_count / u.attendance_logs_count) * 100)
        : null;

      return {
        id: u.id,
        username: u.username,
        created_at: u.created_at,
        is_admin: Boolean(u.is_admin),
        limits: {
          monthly_budget: u.monthly_budget_limit,
          daily_budget: u.daily_budget_limit,
          attendance_target: u.attendance_target_pct
        },
        stats: {
          subjects_count: u.subjects_count,
          attendance_logs_count: u.attendance_logs_count,
          attendance_rate: attendanceRate,
          transactions_count: u.transactions_count,
          total_spent: u.total_spent,
          gym_logs_count: u.gym_logs_count,
          skincare_logs_count: u.skincare_logs_count,
          projects_count: u.projects_count,
          courses_count: u.courses_count,
          last_activity_date: u.last_activity_date || u.created_at
        }
      };
    });

    res.json(usersWithStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Deep dive into a specific user's activity
 */
router.get('/users/:id/activity', async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await getQuery('SELECT id, username, created_at, is_admin FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subjects = await allQuery('SELECT * FROM subjects WHERE user_id = ? ORDER BY name ASC', [userId]);
    const attendanceLogs = await allQuery(`
      SELECT al.*, s.name as subject_name 
      FROM attendance_logs al 
      JOIN subjects s ON al.subject_id = s.id 
      WHERE s.user_id = ? 
      ORDER BY al.date DESC, al.id DESC 
      LIMIT 100
    `, [userId]);

    const formattedSubjects = subjects.map(s => {
      let displayName = s.name;
      if (req.userId === Number(userId)) {
        displayName = decrypt(s.name, req.userKey) || s.name;
      } else if (displayName && displayName.includes(':')) {
        displayName = `Subject #${s.id}`;
      }
      return { ...s, name: displayName };
    });

    const formattedAttendance = attendanceLogs.map(al => {
      let subName = al.subject_name;
      if (req.userId === Number(userId)) {
        subName = decrypt(al.subject_name, req.userKey) || al.subject_name;
      } else if (subName && subName.includes(':')) {
        subName = `Subject #${al.subject_id}`;
      }
      return { ...al, subject_name: subName };
    });

    const transactions = await allQuery('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 100', [userId]);
    const gymLogs = await allQuery('SELECT * FROM gym_daily_logs WHERE user_id = ? ORDER BY date DESC LIMIT 50', [userId]);
    const skincareLogs = await allQuery('SELECT * FROM skincare_logs WHERE user_id = ? ORDER BY date DESC LIMIT 50', [userId]);
    const projects = await allQuery('SELECT * FROM projects WHERE user_id = ? ORDER BY id DESC', [userId]);
    const courses = await allQuery('SELECT * FROM courses WHERE user_id = ? ORDER BY id DESC', [userId]);

    res.json({
      user,
      activity: {
        subjects: formattedSubjects,
        attendance_logs: formattedAttendance,
        transactions,
        gym_logs: gymLogs,
        skincare_logs: skincareLogs,
        projects,
        courses
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Unified system-wide recent activity stream across all users
 */
router.get('/recent-activity', async (req, res) => {
  try {
    const recentActivity = await allQuery(`
      SELECT * FROM (
        SELECT 
          'attendance' as type,
          al.date as date,
          al.id as record_id,
          u.username as username,
          u.id as user_id,
          'Marked ' || al.status || ' for ' || (CASE WHEN s.name LIKE '%:%' THEN 'Subject #' || s.id ELSE s.name END) || (CASE WHEN al.notes IS NOT NULL AND al.notes != '' THEN ' (' || al.notes || ')' ELSE '' END) as description
        FROM attendance_logs al
        JOIN subjects s ON al.subject_id = s.id
        JOIN users u ON s.user_id = u.id

        UNION ALL

        SELECT 
          'finance' as type,
          t.date as date,
          t.id as record_id,
          u.username as username,
          u.id as user_id,
          'Spent LKR ' || t.amount || ' on ' || t.category || (CASE WHEN t.description IS NOT NULL AND t.description != '' THEN ' (' || t.description || ')' ELSE '' END) as description
        FROM transactions t
        JOIN users u ON t.user_id = u.id

        UNION ALL

        SELECT 
          'gym' as type,
          g.date as date,
          g.id as record_id,
          u.username as username,
          u.id as user_id,
          'Logged gym workout' || (CASE WHEN g.workout_summary IS NOT NULL AND g.workout_summary != '' THEN ': ' || g.workout_summary ELSE '' END) as description
        FROM gym_daily_logs g
        JOIN users u ON g.user_id = u.id

        UNION ALL

        SELECT 
          'skincare' as type,
          sk.date as date,
          sk.id as record_id,
          u.username as username,
          u.id as user_id,
          'Completed ' || sk.routine_type || ' skincare routine (rating: ' || sk.skin_rating || '/5)' as description
        FROM skincare_logs sk
        JOIN users u ON sk.user_id = u.id

        UNION ALL

        SELECT 
          'project' as type,
          COALESCE(p.due_date, datetime('now')) as date,
          p.id as record_id,
          u.username as username,
          u.id as user_id,
          'Project: ' || p.name || ' [' || p.status || ']' as description
        FROM projects p
        JOIN users u ON p.user_id = u.id
      )
      ORDER BY date DESC, record_id DESC
      LIMIT 60
    `);

    res.json(recentActivity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Toggle developer/admin status for a user
 */
router.post('/users/:id/toggle-admin', async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await getQuery('SELECT id, username, is_admin FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newStatus = user.is_admin ? 0 : 1;
    await db.runAsync('UPDATE users SET is_admin = ? WHERE id = ?', [newStatus, userId]);

    res.json({
      message: `User ${user.username} is now ${newStatus ? 'an Administrator' : 'a standard User'}.`,
      user_id: user.id,
      is_admin: Boolean(newStatus)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
