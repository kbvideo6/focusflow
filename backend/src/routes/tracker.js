import express from 'express';
import db from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';
import { encrypt, decrypt } from '../utils/crypto.js';

const router = express.Router();

// Helper: Run SQL as a promise
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
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

// ==========================================
// 1. TIMETABLE ENDPOINTS
// ==========================================
router.get('/timetable', verifyToken, async (req, res) => {
  try {
    const rows = await allQuery(
      `SELECT * FROM timetable 
       WHERE user_id = ? 
          OR (user_id IS NULL AND NOT EXISTS (SELECT 1 FROM timetable WHERE user_id = ?)) 
       ORDER BY day_of_week, time_slot`,
      [req.userId, req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/timetable/import', verifyToken, async (req, res) => {
  const { csvText } = req.body;
  if (!csvText) {
    return res.status(400).json({ error: 'CSV content is required.' });
  }

  try {
    const lines = csvText.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      return res.status(400).json({ error: 'Empty CSV content.' });
    }

    // Delete old timetable for this user
    await runQuery('DELETE FROM timetable WHERE user_id = ?', [req.userId]);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim());
      if (cells.length < 2) continue;

      const timeSlot = cells[0];
      if (timeSlot.toLowerCase().includes('break') || cells[1].toLowerCase().includes('break')) {
        continue;
      }

      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        const dayName = days[dayIdx];
        const cellValue = cells[dayIdx + 1];

        if (!cellValue || cellValue.trim() === '') continue;
        if (cellValue.toUpperCase().includes('BREAK')) continue;

        let subject = cellValue;
        let location = '';

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

        await runQuery(
          'INSERT INTO timetable (user_id, day_of_week, time_slot, subject_name, location) VALUES (?, ?, ?, ?, ?)',
          [req.userId, dayName, timeSlot, subject, location]
        );

        // Auto-create unique subject in encrypted dashboard if it doesn't exist
        const subjects = await allQuery('SELECT name FROM subjects WHERE user_id = ?', [req.userId]);
        const exists = subjects.some(row => decrypt(row.name, req.userKey).toLowerCase() === subject.toLowerCase());
        if (!exists) {
          const encName = encrypt(subject, req.userKey);
          const encTarget = encrypt(80, req.userKey);
          const encTargetRequired = encrypt(1, req.userKey);
          const encPriority = encrypt('Medium', req.userKey);
          const encEffort = encrypt('Medium', req.userKey);
          const encGrade = encrypt('A', req.userKey);
          await runQuery(
            `INSERT INTO subjects (user_id, name, attendance_target, attendance_target_required, priority, effort_needed, projected_grade)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, encName, encTarget, encTargetRequired, encPriority, encEffort, encGrade]
          );
        }
      }
    }

    res.json({ message: 'Timetable imported successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/timetable/schedule', verifyToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required.' });
  }

  try {
    // 1. Fetch user timetable slots
    const timetable = await allQuery(
      `SELECT * FROM timetable 
       WHERE user_id = ? 
          OR (user_id IS NULL AND NOT EXISTS (SELECT 1 FROM timetable WHERE user_id = ?)) 
       ORDER BY day_of_week, time_slot`,
      [req.userId, req.userId]
    );

    // 2. Fetch user attendance logs for the range
    const logs = await allQuery(
      `SELECT al.id, al.date, al.status, al.notes, s.name as subject_name 
       FROM attendance_logs al
       JOIN subjects s ON al.subject_id = s.id
       WHERE s.user_id = ? AND al.date >= ? AND al.date <= ?`,
      [req.userId, startDate, endDate]
    );

    const decryptedLogs = logs.map(l => ({
      ...l,
      subject_name: decrypt(l.subject_name, req.userKey, 'string'),
      notes: decrypt(l.notes, req.userKey, 'string')
    }));

    // 3. Generate list of dates in range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const resultSchedule = [];

    const daysOfWeekMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayName = daysOfWeekMap[d.getDay()];

      // Only handle Monday to Friday for timetable
      if (dayName === 'Sunday' || dayName === 'Saturday') continue;

      const daySlots = timetable.filter(t => t.day_of_week === dayName);

      daySlots.forEach(slot => {
        const matchingLog = decryptedLogs.find(l => 
          l.date === dateStr && l.subject_name.toLowerCase() === slot.subject_name.toLowerCase()
        );

        resultSchedule.push({
          date: dateStr,
          dayOfWeek: dayName,
          timeSlot: slot.time_slot,
          subjectName: slot.subject_name,
          location: slot.location || '',
          log: matchingLog || null
        });
      });
    }

    res.json(resultSchedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. SUBJECTS & ATTENDANCE ENDPOINTS
// ==========================================
router.get('/subjects', verifyToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const subjects = await allQuery('SELECT * FROM subjects WHERE user_id = ?', [req.userId]);
    const subjectsWithStats = [];

    // Fetch user attendance target configuration
    const user = await getQuery('SELECT attendance_target_pct FROM users WHERE id = ?', [req.userId]);
    const globalTarget = user?.attendance_target_pct ? decrypt(user.attendance_target_pct, req.userKey, 'number') : 80.0;

    for (const sub of subjects) {
      const decSub = {
        ...sub,
        name: decrypt(sub.name, req.userKey, 'string'),
        attendance_target: decrypt(sub.attendance_target, req.userKey, 'number'),
        attendance_target_required: decrypt(sub.attendance_target_required, req.userKey, 'number'),
        priority: decrypt(sub.priority, req.userKey, 'string'),
        effort_needed: decrypt(sub.effort_needed, req.userKey, 'string'),
        projected_grade: decrypt(sub.projected_grade, req.userKey, 'string')
      };

      let logsQuery = 'SELECT status FROM attendance_logs WHERE subject_id = ?';
      const params = [decSub.id];
      if (startDate) {
        logsQuery += ' AND date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        logsQuery += ' AND date <= ?';
        params.push(endDate);
      }
      const logs = await allQuery(logsQuery, params);
      
      let present = 0;
      let absent = 0;
      let medical = 0;
      let cancelled = 0;

      logs.forEach(log => {
        if (log.status === 'present') present++;
        else if (log.status === 'absent') absent++;
        else if (log.status === 'medical') medical++;
        else if (log.status === 'cancelled') cancelled++;
      });

      const totalClasses = present + absent; // Medical and cancelled don't count in denominator
      const percentage = totalClasses > 0 ? Math.round((present / totalClasses) * 100) : 100;
      
      const target = decSub.attendance_target || globalTarget;
      let safetyStatus = 'SAFE';
      let msg = '';

      if (decSub.attendance_target_required) {
        if (percentage < target) {
          safetyStatus = 'CRITICAL';
          const targetFrac = target / 100;
          const x = Math.ceil((totalClasses * targetFrac - present) / (1 - targetFrac));
          msg = `Must attend next ${x > 0 ? x : 1} class(es)`;
        } else {
          const targetFrac = target / 100;
          const maxSkip = Math.floor(present / targetFrac - totalClasses);
          const skip = maxSkip >= 0 ? maxSkip : 0;
          
          if (skip === 0) {
            safetyStatus = 'CAUTION';
            msg = 'At threshold. Cannot skip.';
          } else {
            safetyStatus = 'SAFE';
            msg = `Safe to skip ${skip} class(es)`;
          }
        }
      } else {
        safetyStatus = 'EXEMPT';
        msg = 'Attendance target not required';
      }

      subjectsWithStats.push({
        ...decSub,
        present_count: present,
        absent_count: absent,
        medical_count: medical,
        cancelled_count: cancelled,
        percentage,
        safetyStatus,
        message: msg
      });
    }

    res.json(subjectsWithStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/subjects/add', verifyToken, async (req, res) => {
  const { name, attendance_target, attendance_target_required, priority, effort_needed, projected_grade } = req.body;
  if (!name) return res.status(400).json({ error: 'Subject name is required.' });

  try {
    // Check for duplicate subject name in JavaScript due to encrypted values
    const existingRows = await allQuery('SELECT name FROM subjects WHERE user_id = ?', [req.userId]);
    const exists = existingRows.some(row => decrypt(row.name, req.userKey).toLowerCase() === name.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: 'Subject already exists.' });
    }

    const encName = encrypt(name, req.userKey);
    const encTarget = encrypt(attendance_target || 80, req.userKey);
    const encTargetRequired = encrypt(attendance_target_required !== undefined ? attendance_target_required : 1, req.userKey);
    const encPriority = encrypt(priority || 'Medium', req.userKey);
    const encEffort = encrypt(effort_needed || 'Medium', req.userKey);
    const encGrade = encrypt(projected_grade || 'A', req.userKey);

    await runQuery(
      `INSERT INTO subjects (user_id, name, attendance_target, attendance_target_required, priority, effort_needed, projected_grade)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, encName, encTarget, encTargetRequired, encPriority, encEffort, encGrade]
    );
    res.status(201).json({ message: 'Subject added successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/subjects/:id', verifyToken, async (req, res) => {
  const { name, attendance_target, attendance_target_required, priority, effort_needed, projected_grade } = req.body;
  
  try {
    const encName = encrypt(name, req.userKey);
    const encTarget = encrypt(attendance_target, req.userKey);
    const encTargetRequired = encrypt(attendance_target_required, req.userKey);
    const encPriority = encrypt(priority, req.userKey);
    const encEffort = encrypt(effort_needed, req.userKey);
    const encGrade = encrypt(projected_grade, req.userKey);

    await runQuery(
      `UPDATE subjects 
       SET name = ?, attendance_target = ?, attendance_target_required = ?, priority = ?, effort_needed = ?, projected_grade = ?
       WHERE id = ? AND user_id = ?`,
      [encName, encTarget, encTargetRequired, encPriority, encEffort, encGrade, req.params.id, req.userId]
    );
    res.json({ message: 'Subject updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/subjects/:id', verifyToken, async (req, res) => {
  try {
    await runQuery('DELETE FROM subjects WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Subject deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. ATTENDANCE LOGGING ENDPOINTS
// ==========================================
router.post('/attendance/log', verifyToken, async (req, res) => {
  const { subject_name, date, status, notes } = req.body; // status: present, absent, medical
  if (!subject_name || !date || !status) {
    return res.status(400).json({ error: 'subject_name, date, and status are required.' });
  }

  try {
    // Find subject in memory (due to encryption)
    const subjects = await allQuery('SELECT id, name FROM subjects WHERE user_id = ?', [req.userId]);
    let subject = subjects.find(s => decrypt(s.name, req.userKey).toLowerCase() === subject_name.toLowerCase());
    
    if (!subject) {
      const encName = encrypt(subject_name, req.userKey);
      const encTargetRequired = encrypt(1, req.userKey);
      const result = await runQuery(
        'INSERT INTO subjects (user_id, name, attendance_target_required) VALUES (?, ?, ?)',
        [req.userId, encName, encTargetRequired]
      );
      subject = { id: result.lastID };
    }

    const encNotes = encrypt(notes || '', req.userKey);

    // Insert attendance log
    await runQuery(
      'INSERT INTO attendance_logs (subject_id, date, status, notes) VALUES (?, ?, ?, ?)',
      [subject.id, date, status, encNotes]
    );
    res.status(201).json({ message: 'Attendance logged successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance/history', verifyToken, async (req, res) => {
  const { startDate, endDate, subjectId } = req.query;
  try {
    let sql = `
      SELECT al.id, al.date, al.status, al.notes, al.subject_id, s.name as subject_name 
      FROM attendance_logs al
      JOIN subjects s ON al.subject_id = s.id
      WHERE s.user_id = ?
    `;
    const params = [req.userId];
    if (startDate) {
      sql += ' AND al.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND al.date <= ?';
      params.push(endDate);
    }
    if (subjectId) {
      sql += ' AND al.subject_id = ?';
      params.push(subjectId);
    }
    sql += ' ORDER BY al.date DESC, al.id DESC LIMIT 100';

    const rows = await allQuery(sql, params);
    
    const decryptedRows = rows.map(r => ({
      ...r,
      subject_name: decrypt(r.subject_name, req.userKey, 'string'),
      notes: decrypt(r.notes, req.userKey, 'string')
    }));
    
    res.json(decryptedRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/attendance/log/:id', verifyToken, async (req, res) => {
  try {
    // Ensure the log belongs to this user's subject
    const log = await getQuery(
      `SELECT al.id FROM attendance_logs al
       JOIN subjects s ON al.subject_id = s.id
       WHERE al.id = ? AND s.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!log) {
      return res.status(404).json({ error: 'Log not found or unauthorized.' });
    }
    await runQuery('DELETE FROM attendance_logs WHERE id = ?', [req.params.id]);
    res.json({ message: 'Attendance log deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/attendance/log/:id', verifyToken, async (req, res) => {
  const { date, status, notes } = req.body;
  if (!date || !status) {
    return res.status(400).json({ error: 'Date and status are required.' });
  }

  try {
    // Ensure the log belongs to this user's subject
    const log = await getQuery(
      `SELECT al.id FROM attendance_logs al
       JOIN subjects s ON al.subject_id = s.id
       WHERE al.id = ? AND s.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!log) {
      return res.status(404).json({ error: 'Log not found or unauthorized.' });
    }

    const encNotes = encrypt(notes || '', req.userKey);

    await runQuery(
      `UPDATE attendance_logs 
       SET date = ?, status = ?, notes = ?
       WHERE id = ?`,
      [date, status, encNotes, req.params.id]
    );

    res.json({ message: 'Attendance log updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. FINANCE (DAILY SPENDING) ENDPOINTS
// ==========================================
router.get('/finance/transactions', verifyToken, async (req, res) => {
  try {
    const rows = await allQuery(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC',
      [req.userId]
    );
    const decryptedRows = rows.map(r => ({
      ...r,
      amount: decrypt(r.amount, req.userKey, 'number'),
      category: decrypt(r.category, req.userKey, 'string'),
      description: decrypt(r.description, req.userKey, 'string')
    }));
    res.json(decryptedRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/finance/transactions', verifyToken, async (req, res) => {
  const { amount, category, description, date } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'Amount, category, and date are required.' });
  }

  try {
    const encAmount = encrypt(amount, req.userKey);
    const encCategory = encrypt(category, req.userKey);
    const encDescription = encrypt(description, req.userKey);

    await runQuery(
      'INSERT INTO transactions (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)',
      [req.userId, encAmount, encCategory, encDescription, date]
    );
    res.status(201).json({ message: 'Transaction logged successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/finance/transactions/:id', verifyToken, async (req, res) => {
  try {
    await runQuery('DELETE FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Transaction deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/finance/summary', verifyToken, async (req, res) => {
  try {
    const user = await getQuery(
      'SELECT monthly_budget_limit, daily_budget_limit FROM users WHERE id = ?',
      [req.userId]
    );
    const monthlyLimit = user?.monthly_budget_limit ? decrypt(user.monthly_budget_limit, req.userKey, 'number') : 30000;
    const dailyLimit = user?.daily_budget_limit ? decrypt(user.daily_budget_limit, req.userKey, 'number') : 1000;

    const todayStr = new Date().toISOString().split('T')[0];
    const thisMonthPrefix = todayStr.substring(0, 7); // YYYY-MM

    // Fetch all transactions for this user
    const transactions = await allQuery(
      'SELECT amount, category, date FROM transactions WHERE user_id = ?',
      [req.userId]
    );

    // Decrypt transactions in memory
    const decryptedTx = transactions.map(t => ({
      amount: decrypt(t.amount, req.userKey, 'number'),
      category: decrypt(t.category, req.userKey, 'string'),
      date: t.date
    }));

    // Calculate monthly spent
    let monthlySpent = 0;
    decryptedTx.forEach(t => {
      if (t.date && t.date.startsWith(thisMonthPrefix)) {
        monthlySpent += t.amount || 0;
      }
    });

    // Calculate daily spent
    let dailySpent = 0;
    decryptedTx.forEach(t => {
      if (t.date === todayStr) {
        dailySpent += t.amount || 0;
      }
    });

    // Category breakdown (for pie chart)
    const categoryMap = {};
    decryptedTx.forEach(t => {
      if (t.date && t.date.startsWith(thisMonthPrefix)) {
        const cat = t.category || 'Other';
        categoryMap[cat] = (categoryMap[cat] || 0) + (t.amount || 0);
      }
    });
    const categories = Object.entries(categoryMap).map(([category, amount]) => ({
      category,
      amount
    }));

    // Recent 7 days spending details (trends for line chart)
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      let dayTotal = 0;
      decryptedTx.forEach(t => {
        if (t.date === dateStr) {
          dayTotal += t.amount || 0;
        }
      });

      trends.push({
        date: dateStr,
        day: dayName,
        amount: dayTotal
      });
    }

    res.json({
      monthlyLimit,
      dailyLimit,
      monthlySpent,
      dailySpent,
      categories,
      trends
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. GYM & HEALTH TRACKER ENDPOINTS
// ==========================================
router.get('/gym/daily', verifyToken, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required.' });

  try {
    let log = await getQuery('SELECT * FROM gym_daily_logs WHERE user_id = ? AND date = ?', [req.userId, date]);
    if (log) {
      log = {
        ...log,
        visited: decrypt(log.visited, req.userKey, 'number'),
        water_intake_ml: decrypt(log.water_intake_ml, req.userKey, 'number'),
        sleep_hours: decrypt(log.sleep_hours, req.userKey, 'number'),
        workout_summary: decrypt(log.workout_summary, req.userKey, 'string')
      };
    } else {
      log = { user_id: req.userId, date, visited: 0, water_intake_ml: 0, sleep_hours: 0, workout_summary: '' };
    }
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gym/daily', verifyToken, async (req, res) => {
  const { date, visited, water_intake_ml, sleep_hours, workout_summary } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required.' });

  try {
    const encVisited = encrypt(visited ? 1 : 0, req.userKey);
    const encWater = encrypt(water_intake_ml || 0, req.userKey);
    const encSleep = encrypt(sleep_hours || 0.0, req.userKey);
    const encWorkout = encrypt(workout_summary || '', req.userKey);

    await runQuery(
      `INSERT INTO gym_daily_logs (user_id, date, visited, water_intake_ml, sleep_hours, workout_summary)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         visited = excluded.visited,
         water_intake_ml = excluded.water_intake_ml,
         sleep_hours = excluded.sleep_hours,
         workout_summary = excluded.workout_summary`,
      [req.userId, date, encVisited, encWater, encSleep, encWorkout]
    );
    res.json({ message: 'Daily gym status saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gym/templates', verifyToken, async (req, res) => {
  try {
    const templates = await allQuery('SELECT * FROM workout_templates WHERE user_id = ?', [req.userId]);
    const fullTemplates = [];
    
    for (const t of templates) {
      const exercises = await allQuery(
        'SELECT * FROM workout_exercises WHERE template_id = ? ORDER BY sort_order',
        [t.id]
      );
      
      const decExercises = exercises.map(ex => ({
        ...ex,
        name: decrypt(ex.name, req.userKey, 'string')
      }));

      fullTemplates.push({
        ...t,
        name: decrypt(t.name, req.userKey, 'string'),
        exercises: decExercises
      });
    }
    res.json(fullTemplates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gym/templates', verifyToken, async (req, res) => {
  const { name, exercises } = req.body; // exercises: array of strings
  if (!name) return res.status(400).json({ error: 'Template name is required.' });

  try {
    const encName = encrypt(name, req.userKey);
    const result = await runQuery('INSERT INTO workout_templates (user_id, name) VALUES (?, ?)', [req.userId, encName]);
    const templateId = result.lastID;

    if (exercises && Array.isArray(exercises)) {
      for (let i = 0; i < exercises.length; i++) {
        const encExName = encrypt(exercises[i], req.userKey);
        await runQuery(
          'INSERT INTO workout_exercises (template_id, name, sort_order) VALUES (?, ?, ?)',
          [templateId, encExName, i]
        );
      }
    }
    res.status(201).json({ message: 'Workout template created successfully.', templateId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gym/logs', verifyToken, async (req, res) => {
  const { date } = req.query;
  try {
    const sql = date 
      ? 'SELECT * FROM workout_logs WHERE user_id = ? AND date = ?' 
      : 'SELECT * FROM workout_logs WHERE user_id = ? ORDER BY date DESC';
    const params = date ? [req.userId, date] : [req.userId];
    
    const rows = await allQuery(sql, params);
    const parsedLogs = rows.map(r => ({
      ...r,
      exercise_name: decrypt(r.exercise_name, req.userKey, 'string'),
      sets: decrypt(r.sets, req.userKey, 'json')
    }));
    res.json(parsedLogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gym/logs', verifyToken, async (req, res) => {
  const { date, exercise_name, sets } = req.body; // sets: array of {reps, weight}
  if (!date || !exercise_name || !sets) {
    return res.status(400).json({ error: 'Date, exercise name, and sets are required.' });
  }

  try {
    const encExName = encrypt(exercise_name, req.userKey);
    const encSets = encrypt(sets, req.userKey);

    await runQuery(
      'INSERT INTO workout_logs (user_id, date, exercise_name, sets) VALUES (?, ?, ?, ?)',
      [req.userId, date, encExName, encSets]
    );
    res.status(201).json({ message: 'Workout logged successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. SKINCARE TRACKER ENDPOINTS
// ==========================================
router.get('/skincare/daily', verifyToken, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required.' });

  try {
    const logs = await allQuery('SELECT * FROM skincare_logs WHERE user_id = ? AND date = ?', [req.userId, date]);
    const status = { morning: null, night: null };
    
    logs.forEach(l => {
      status[l.routine_type] = {
        completed_items: decrypt(l.completed_items, req.userKey, 'json'),
        skin_rating: decrypt(l.skin_rating, req.userKey, 'number'),
        notes: decrypt(l.notes, req.userKey, 'string')
      };
    });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/skincare/daily', verifyToken, async (req, res) => {
  const { date, routine_type, completed_items, skin_rating, notes } = req.body;
  if (!date || !routine_type || !completed_items) {
    return res.status(400).json({ error: "Date, routine_type ('morning' or 'night'), and completed_items are required." });
  }

  try {
    const encCompletedItems = encrypt(completed_items, req.userKey);
    const encSkinRating = encrypt(skin_rating || 4, req.userKey);
    const encNotes = encrypt(notes || '', req.userKey);

    await runQuery(
      `INSERT INTO skincare_logs (user_id, date, routine_type, completed_items, skin_rating, notes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date, routine_type) DO UPDATE SET
         completed_items = excluded.completed_items,
         skin_rating = excluded.skin_rating,
         notes = excluded.notes`,
      [req.userId, date, routine_type, encCompletedItems, encSkinRating, encNotes]
    );
    res.json({ message: 'Skincare routine saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. PROJECTS ENDPOINTS
// ==========================================
router.get('/projects', verifyToken, async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM projects WHERE user_id = ? ORDER BY due_date ASC', [req.userId]);
    const decryptedRows = rows.map(r => ({
      ...r,
      name: decrypt(r.name, req.userKey, 'string'),
      description: decrypt(r.description, req.userKey, 'string'),
      priority: decrypt(r.priority, req.userKey, 'string')
    }));
    res.json(decryptedRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects', verifyToken, async (req, res) => {
  const { name, description, status, due_date, priority } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required.' });

  try {
    const encName = encrypt(name, req.userKey);
    const encDescription = encrypt(description || '', req.userKey);
    const encPriority = encrypt(priority || 'Medium', req.userKey);

    await runQuery(
      `INSERT INTO projects (user_id, name, description, status, due_date, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, encName, encDescription, status || 'todo', due_date, encPriority]
    );
    res.status(201).json({ message: 'Project created successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/projects/:id', verifyToken, async (req, res) => {
  const { name, description, status, due_date, priority } = req.body;
  try {
    const encName = encrypt(name, req.userKey);
    const encDescription = encrypt(description, req.userKey);
    const encPriority = encrypt(priority, req.userKey);

    await runQuery(
      `UPDATE projects 
       SET name = ?, description = ?, status = ?, due_date = ?, priority = ?
       WHERE id = ? AND user_id = ?`,
      [encName, encDescription, status, due_date, encPriority, req.params.id, req.userId]
    );
    res.json({ message: 'Project updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id', verifyToken, async (req, res) => {
  try {
    await runQuery('DELETE FROM projects WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Project deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. COURSES ENDPOINTS
// ==========================================
router.get('/courses', verifyToken, async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM courses WHERE user_id = ?', [req.userId]);
    const decryptedRows = rows.map(r => ({
      ...r,
      name: decrypt(r.name, req.userKey, 'string'),
      platform: decrypt(r.platform, req.userKey, 'string'),
      notes: decrypt(r.notes, req.userKey, 'string')
    }));
    res.json(decryptedRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/courses', verifyToken, async (req, res) => {
  const { name, platform, progress_pct, hours_studied, notes } = req.body;
  if (!name || !platform) return res.status(400).json({ error: 'Course name and platform are required.' });

  try {
    const encName = encrypt(name, req.userKey);
    const encPlatform = encrypt(platform, req.userKey);
    const encNotes = encrypt(notes || '', req.userKey);

    await runQuery(
      `INSERT INTO courses (user_id, name, platform, progress_pct, hours_studied, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, encName, encPlatform, progress_pct || 0, hours_studied || 0.0, encNotes]
    );
    res.status(201).json({ message: 'Course added.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/courses/:id', verifyToken, async (req, res) => {
  const { name, platform, progress_pct, hours_studied, notes } = req.body;
  try {
    const encName = encrypt(name, req.userKey);
    const encPlatform = encrypt(platform, req.userKey);
    const encNotes = encrypt(notes, req.userKey);

    await runQuery(
      `UPDATE courses 
       SET name = ?, platform = ?, progress_pct = ?, hours_studied = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [encName, encPlatform, progress_pct, hours_studied, encNotes, req.params.id, req.userId]
    );
    res.json({ message: 'Course updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/courses/:id', verifyToken, async (req, res) => {
  try {
    await runQuery('DELETE FROM courses WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Course deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
