import express from 'express';
import db from '../config/db.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { parseTimetableCsv } from '../utils/timetable.js';

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
    const entries = parseTimetableCsv(csvText);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Empty CSV content.' });
    }

    // Delete old timetable for this user
    await runQuery('DELETE FROM timetable WHERE user_id = ?', [req.userId]);

    for (const entry of entries) {
        await runQuery(
          'INSERT INTO timetable (user_id, day_of_week, time_slot, subject_name, location) VALUES (?, ?, ?, ?, ?)',
          [req.userId, entry.day, entry.timeSlot, entry.subject, entry.location]
        );

        // Auto-create unique subject in encrypted dashboard if it doesn't exist
        const subjects = await allQuery('SELECT name FROM subjects WHERE user_id = ?', [req.userId]);
        const exists = subjects.some(row => decrypt(row.name, req.userKey).toLowerCase() === entry.subject.toLowerCase());
        if (!exists) {
          const encName = encrypt(entry.subject, req.userKey);
          const encTarget = encrypt(80, req.userKey);
          const encTargetRequired = encrypt(1, req.userKey);
          const encPriority = encrypt('Medium', req.userKey);
          const encEffort = encrypt('Medium', req.userKey);
          const encGrade = encrypt('A', req.userKey);
          const encMarks = encrypt(0, req.userKey);
          await runQuery(
            `INSERT INTO subjects (user_id, name, attendance_target, attendance_target_required, priority, effort_needed, projected_grade, current_marks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, encName, encTarget, encTargetRequired, encPriority, encEffort, encGrade, encMarks]
          );
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
        projected_grade: decrypt(sub.projected_grade, req.userKey, 'string'),
        current_marks: sub.current_marks ? decrypt(sub.current_marks, req.userKey, 'number') : 0
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
  const { name, attendance_target, attendance_target_required, priority, effort_needed, projected_grade, current_marks } = req.body;
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
    const encMarks = encrypt(current_marks !== undefined && current_marks !== null ? Number(current_marks) : 0, req.userKey);

    await runQuery(
      `INSERT INTO subjects (user_id, name, attendance_target, attendance_target_required, priority, effort_needed, projected_grade, current_marks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, encName, encTarget, encTargetRequired, encPriority, encEffort, encGrade, encMarks]
    );
    res.status(201).json({ message: 'Subject added successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/subjects/:id', verifyToken, async (req, res) => {
  const { name, attendance_target, attendance_target_required, priority, effort_needed, projected_grade, current_marks } = req.body;
  
  try {
    const encName = encrypt(name, req.userKey);
    const encTarget = encrypt(attendance_target, req.userKey);
    const encTargetRequired = encrypt(attendance_target_required, req.userKey);
    const encPriority = encrypt(priority, req.userKey);
    const encEffort = encrypt(effort_needed, req.userKey);
    const encGrade = encrypt(projected_grade, req.userKey);
    const encMarks = encrypt(current_marks !== undefined && current_marks !== null ? Number(current_marks) : 0, req.userKey);

    await runQuery(
      `UPDATE subjects 
       SET name = ?, attendance_target = ?, attendance_target_required = ?, priority = ?, effort_needed = ?, projected_grade = ?, current_marks = ?
       WHERE id = ? AND user_id = ?`,
      [encName, encTarget, encTargetRequired, encPriority, encEffort, encGrade, encMarks, req.params.id, req.userId]
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
// 5. FINANCE (DAILY & WEEKLY SPENDING / INCOME) ENDPOINTS
// ==========================================
router.get('/finance/transactions', verifyToken, async (req, res) => {
  try {
    const rows = await allQuery(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC',
      [req.userId]
    );
    const decryptedRows = rows.map(r => {
      let decType = 'expense';
      if (r.type) {
        try {
          decType = decrypt(r.type, req.userKey, 'string');
        } catch (e) {
          decType = r.type;
        }
      }
      return {
        ...r,
        amount: decrypt(r.amount, req.userKey, 'number'),
        category: decrypt(r.category, req.userKey, 'string'),
        description: decrypt(r.description, req.userKey, 'string'),
        type: decType || 'expense'
      };
    });
    res.json(decryptedRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/finance/transactions', verifyToken, async (req, res) => {
  const { amount, category, description, date, type } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'Amount, category, and date are required.' });
  }

  try {
    const encAmount = encrypt(amount, req.userKey);
    const encCategory = encrypt(category, req.userKey);
    const encDescription = encrypt(description || '', req.userKey);
    const txType = type === 'income' ? 'income' : 'expense';
    const encType = encrypt(txType, req.userKey);

    await runQuery(
      'INSERT INTO transactions (user_id, amount, category, description, date, type) VALUES (?, ?, ?, ?, ?, ?)',
      [req.userId, encAmount, encCategory, encDescription, date, encType]
    );
    res.status(201).json({ message: `${txType === 'income' ? 'Income' : 'Transaction'} logged successfully.` });
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

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const thisMonthPrefix = todayStr.substring(0, 7); // YYYY-MM

    // Current week date calculation (Monday to Sunday)
    const currentDayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - currentDayOfWeek + (currentDayOfWeek === 0 ? -6 : 1);
    const mondayDate = new Date(now);
    mondayDate.setDate(diffToMonday);
    mondayDate.setHours(0, 0, 0, 0);

    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(sundayDate.getDate() + 6);
    sundayDate.setHours(23, 59, 59, 999);

    const mondayStr = mondayDate.toISOString().split('T')[0];
    const sundayStr = sundayDate.toISOString().split('T')[0];

    // Calendar days in month calculations
    const year = now.getFullYear();
    const month = now.getMonth();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysRemainingInMonth = Math.max(1, totalDaysInMonth - dayOfMonth + 1);

    // Fetch all transactions for this user
    const transactions = await allQuery(
      'SELECT id, amount, category, description, date, type FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC',
      [req.userId]
    );

    // Decrypt transactions in memory
    const decryptedTx = transactions.map(t => {
      let decType = 'expense';
      if (t.type) {
        try {
          decType = decrypt(t.type, req.userKey, 'string');
        } catch (e) {
          decType = t.type;
        }
      }
      return {
        id: t.id,
        amount: decrypt(t.amount, req.userKey, 'number'),
        category: decrypt(t.category, req.userKey, 'string'),
        description: decrypt(t.description, req.userKey, 'string'),
        date: t.date,
        type: decType || 'expense'
      };
    });

    // Calculate monthly spent and monthly income
    let monthlySpent = 0;
    let monthlyIncome = 0;
    let monthlyTxCount = 0;

    // Calculate weekly spent and weekly income
    let weeklySpent = 0;
    let weeklyIncome = 0;

    // Calculate daily spent and daily income
    let dailySpent = 0;
    let dailyIncome = 0;

    decryptedTx.forEach(t => {
      const isExpense = t.type === 'expense';
      const isIncome = t.type === 'income';

      if (t.date && t.date.startsWith(thisMonthPrefix)) {
        if (isExpense) monthlySpent += t.amount || 0;
        if (isIncome) monthlyIncome += t.amount || 0;
        monthlyTxCount++;
      }

      if (t.date && t.date >= mondayStr && t.date <= sundayStr) {
        if (isExpense) weeklySpent += t.amount || 0;
        if (isIncome) weeklyIncome += t.amount || 0;
      }

      if (t.date === todayStr) {
        if (isExpense) dailySpent += t.amount || 0;
        if (isIncome) dailyIncome += t.amount || 0;
      }
    });

    // Category breakdown for expenses
    const categoryMap = {};
    const incomeCategoryMap = {};

    decryptedTx.forEach(t => {
      if (t.date && t.date.startsWith(thisMonthPrefix)) {
        const cat = t.category || 'Other';
        if (t.type === 'expense') {
          categoryMap[cat] = (categoryMap[cat] || 0) + (t.amount || 0);
        } else if (t.type === 'income') {
          incomeCategoryMap[cat] = (incomeCategoryMap[cat] || 0) + (t.amount || 0);
        }
      }
    });

    const categories = Object.entries(categoryMap)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: monthlySpent > 0 ? Math.round((amount / monthlySpent) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    const incomeCategories = Object.entries(incomeCategoryMap)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: monthlyIncome > 0 ? Math.round((amount / monthlyIncome) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // Recent 7 days spending & income trends
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      let dayExpense = 0;
      let dayInc = 0;
      decryptedTx.forEach(t => {
        if (t.date === dateStr) {
          if (t.type === 'income') {
            dayInc += t.amount || 0;
          } else {
            dayExpense += t.amount || 0;
          }
        }
      });

      trends.push({
        date: dateStr,
        day: dayName,
        amount: dayExpense,
        income: dayInc,
        net: dayInc - dayExpense
      });
    }

    // Weekly history breakdown (last 4 weeks)
    const weeklyTrends = [];
    for (let w = 3; w >= 0; w--) {
      const wStart = new Date(mondayDate);
      wStart.setDate(wStart.getDate() - (w * 7));
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);

      const wStartStr = wStart.toISOString().split('T')[0];
      const wEndStr = wEnd.toISOString().split('T')[0];

      let wExpense = 0;
      let wIncome = 0;

      decryptedTx.forEach(t => {
        if (t.date >= wStartStr && t.date <= wEndStr) {
          if (t.type === 'income') wIncome += t.amount || 0;
          else wExpense += t.amount || 0;
        }
      });

      const label = `${wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${wEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      weeklyTrends.push({
        weekLabel: label,
        startDate: wStartStr,
        endDate: wEndStr,
        income: wIncome,
        spent: wExpense,
        net: wIncome - wExpense,
        isCurrentWeek: w === 0
      });
    }

    // Analytics indicators
    const remainingMonthlyBudget = Math.max(0, monthlyLimit - monthlySpent);
    const averageDailySpend = Math.round(monthlySpent / Math.max(1, dayOfMonth));
    const projectedMonthlySpend = Math.round(averageDailySpend * totalDaysInMonth);
    const safeDailyRemaining = Math.max(0, Math.round(remainingMonthlyBudget / daysRemainingInMonth));
    const expectedSavings = monthlyLimit - projectedMonthlySpend;
    const monthlyNetSavings = monthlyIncome - monthlySpent;
    const weeklyNetSavings = weeklyIncome - weeklySpent;

    let budgetStatus = 'healthy';
    if (monthlySpent > monthlyLimit) {
      budgetStatus = 'exceeded';
    } else if (projectedMonthlySpend > monthlyLimit || (monthlySpent / monthlyLimit) > 0.85) {
      budgetStatus = 'warning';
    }

    res.json({
      monthlyLimit,
      dailyLimit,
      monthlySpent,
      monthlyIncome,
      monthlyNetSavings,
      weeklySpent,
      weeklyIncome,
      weeklyNetSavings,
      weeklyTarget: Math.round(monthlyLimit / 4.33),
      dailySpent,
      dailyIncome,
      remainingMonthlyBudget,
      averageDailySpend,
      projectedMonthlySpend,
      safeDailyRemaining,
      expectedSavings,
      budgetStatus,
      totalDaysInMonth,
      dayOfMonth,
      daysRemainingInMonth,
      monthlyTxCount,
      categories,
      incomeCategories,
      trends,
      weeklyTrends
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. GYM & HEALTH TRACKER ENDPOINTS
// ==========================================
// 6. GYM & HEALTH TRACKER ENDPOINTS (Admin Only)
// ==========================================
router.get('/gym/daily', verifyToken, requireAdmin, async (req, res) => {
  const { date } = req.query;

  try {
    if (date) {
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
      return res.json(log);
    }

    // Return all daily health logs if date is not specified
    const rows = await allQuery(
      'SELECT * FROM gym_daily_logs WHERE user_id = ? ORDER BY date DESC',
      [req.userId]
    );
    const decryptedLogs = rows.map(l => ({
      id: l.id,
      date: l.date,
      visited: decrypt(l.visited, req.userKey, 'number'),
      water_intake_ml: decrypt(l.water_intake_ml, req.userKey, 'number'),
      sleep_hours: decrypt(l.sleep_hours, req.userKey, 'number'),
      workout_summary: decrypt(l.workout_summary, req.userKey, 'string')
    }));
    res.json(decryptedLogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gym/daily/history', verifyToken, requireAdmin, async (req, res) => {
  try {
    const rows = await allQuery(
      'SELECT * FROM gym_daily_logs WHERE user_id = ? ORDER BY date DESC',
      [req.userId]
    );
    const decryptedLogs = rows.map(l => ({
      id: l.id,
      date: l.date,
      visited: decrypt(l.visited, req.userKey, 'number'),
      water_intake_ml: decrypt(l.water_intake_ml, req.userKey, 'number'),
      sleep_hours: decrypt(l.sleep_hours, req.userKey, 'number'),
      workout_summary: decrypt(l.workout_summary, req.userKey, 'string')
    }));
    res.json(decryptedLogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gym/daily', verifyToken, requireAdmin, async (req, res) => {
  const { date, visited, water_intake_ml, sleep_hours, workout_summary } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required.' });

  try {
    const encVisited = encrypt(visited ? 1 : 0, req.userKey);
    const encWater = encrypt(water_intake_ml || 0, req.userKey);
    const encSleep = encrypt(sleep_hours || 0.0, req.userKey);
    const encWorkout = encrypt(workout_summary || '', req.userKey);

    const existing = await getQuery('SELECT id FROM gym_daily_logs WHERE user_id = ? AND date = ?', [req.userId, date]);
    if (existing) {
      await runQuery(
        `UPDATE gym_daily_logs 
         SET visited = ?, water_intake_ml = ?, sleep_hours = ?, workout_summary = ?
         WHERE id = ?`,
        [encVisited, encWater, encSleep, encWorkout, existing.id]
      );
    } else {
      await runQuery(
        `INSERT INTO gym_daily_logs (user_id, date, visited, water_intake_ml, sleep_hours, workout_summary)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.userId, date, encVisited, encWater, encSleep, encWorkout]
      );
    }
    res.json({ message: 'Daily gym status saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/gym/daily/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM gym_daily_logs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Daily health check-in deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gym/templates', verifyToken, requireAdmin, async (req, res) => {
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

router.post('/gym/templates', verifyToken, requireAdmin, async (req, res) => {
  const { name, exercises } = req.body;
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

router.get('/gym/logs', verifyToken, requireAdmin, async (req, res) => {
  const { date } = req.query;
  try {
    const sql = date 
      ? 'SELECT * FROM workout_logs WHERE user_id = ? AND date = ?' 
      : 'SELECT * FROM workout_logs WHERE user_id = ? ORDER BY date DESC, id DESC';
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

router.post('/gym/logs', verifyToken, requireAdmin, async (req, res) => {
  const { date, exercise_name, sets } = req.body;
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

router.delete('/gym/logs/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM workout_logs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Workout log deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. SKINCARE TRACKER ENDPOINTS (Admin Only)
// ==========================================
router.get('/skincare/daily', verifyToken, requireAdmin, async (req, res) => {
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

router.get('/skincare/history', verifyToken, requireAdmin, async (req, res) => {
  try {
    const rows = await allQuery(
      'SELECT * FROM skincare_logs WHERE user_id = ? ORDER BY date DESC, id DESC',
      [req.userId]
    );
    const decryptedRows = rows.map(l => ({
      id: l.id,
      date: l.date,
      routine_type: l.routine_type,
      completed_items: decrypt(l.completed_items, req.userKey, 'json'),
      skin_rating: decrypt(l.skin_rating, req.userKey, 'number'),
      notes: decrypt(l.notes, req.userKey, 'string')
    }));
    res.json(decryptedRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/skincare/daily', verifyToken, requireAdmin, async (req, res) => {
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

router.delete('/skincare/logs/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM skincare_logs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Skincare log deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. PROJECTS ENDPOINTS (Admin Only)
// ==========================================
router.get('/projects', verifyToken, requireAdmin, async (req, res) => {
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

router.post('/projects', verifyToken, requireAdmin, async (req, res) => {
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

router.put('/projects/:id', verifyToken, requireAdmin, async (req, res) => {
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

router.delete('/projects/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM projects WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Project deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. COURSES ENDPOINTS (Admin Only)
// ==========================================
router.get('/courses', verifyToken, requireAdmin, async (req, res) => {
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

router.post('/courses', verifyToken, requireAdmin, async (req, res) => {
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

router.put('/courses/:id', verifyToken, requireAdmin, async (req, res) => {
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

router.delete('/courses/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM courses WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Course deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 10. CALORIE INTAKE & DEFICIT TRACKER ENDPOINTS (Admin Only)
// ==========================================
router.get('/calories/daily', verifyToken, requireAdmin, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const userRow = await getQuery('SELECT daily_calorie_target FROM users WHERE id = ?', [req.userId]);
    const defaultTarget = userRow?.daily_calorie_target ? Number(userRow.daily_calorie_target) : 2000;

    const log = await getQuery('SELECT * FROM calorie_logs WHERE user_id = ? AND date = ?', [req.userId, targetDate]);

    if (!log) {
      return res.json({
        user_id: req.userId,
        date: targetDate,
        total_calories: 0,
        calorie_target: defaultTarget,
        deficit: defaultTarget,
        status: 'deficit',
        meals: [],
        notes: ''
      });
    }

    const totalCalories = decrypt(log.total_calories, req.userKey, 'number');
    const calorieTarget = decrypt(log.calorie_target, req.userKey, 'number') || defaultTarget;
    const meals = decrypt(log.meals, req.userKey, 'json') || [];
    const notes = decrypt(log.notes, req.userKey, 'string') || '';
    const deficit = calorieTarget - totalCalories;

    res.json({
      id: log.id,
      user_id: req.userId,
      date: log.date,
      total_calories: totalCalories,
      calorie_target: calorieTarget,
      deficit: deficit,
      status: deficit >= 0 ? 'deficit' : 'surplus',
      meals,
      notes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calories/log', verifyToken, requireAdmin, async (req, res) => {
  const { date, total_calories, calorie_target, notes, meal, meals } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const userRow = await getQuery('SELECT daily_calorie_target FROM users WHERE id = ?', [req.userId]);
    const defaultTarget = userRow?.daily_calorie_target ? Number(userRow.daily_calorie_target) : 2000;
    const finalTarget = calorie_target !== undefined && calorie_target !== null ? Number(calorie_target) : defaultTarget;

    const existing = await getQuery('SELECT * FROM calorie_logs WHERE user_id = ? AND date = ?', [req.userId, targetDate]);

    let currentTotal = existing ? decrypt(existing.total_calories, req.userKey, 'number') : 0;
    let currentMeals = existing ? (decrypt(existing.meals, req.userKey, 'json') || []) : [];
    let currentNotes = existing ? (decrypt(existing.notes, req.userKey, 'string') || '') : '';

    if (meal) {
      const mealItem = {
        id: Date.now().toString(),
        name: meal.name || 'Meal / Snack',
        calories: Number(meal.calories) || 0,
        time: meal.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        notes: meal.notes || ''
      };
      currentMeals.push(mealItem);
      if (total_calories === undefined || total_calories === null) {
        currentTotal += mealItem.calories;
      }
    }

    if (meals && Array.isArray(meals)) {
      currentMeals = meals;
    }

    if (total_calories !== undefined && total_calories !== null) {
      currentTotal = Number(total_calories);
    }

    if (notes !== undefined && notes !== null) {
      currentNotes = String(notes);
    }

    const encTotal = encrypt(currentTotal, req.userKey);
    const encTarget = encrypt(finalTarget, req.userKey);
    const encMeals = encrypt(currentMeals, req.userKey);
    const encNotes = encrypt(currentNotes, req.userKey);

    if (existing) {
      await runQuery(
        `UPDATE calorie_logs 
         SET total_calories = ?, calorie_target = ?, meals = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [encTotal, encTarget, encMeals, encNotes, existing.id]
      );
    } else {
      await runQuery(
        `INSERT INTO calorie_logs (user_id, date, total_calories, calorie_target, meals, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.userId, targetDate, encTotal, encTarget, encMeals, encNotes]
      );
    }

    const deficit = finalTarget - currentTotal;
    res.json({
      message: 'Calorie log updated successfully.',
      log: {
        date: targetDate,
        total_calories: currentTotal,
        calorie_target: finalTarget,
        deficit,
        status: deficit >= 0 ? 'deficit' : 'surplus',
        meals: currentMeals,
        notes: currentNotes
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calories/history', verifyToken, requireAdmin, async (req, res) => {
  try {
    const rows = await allQuery(
      'SELECT * FROM calorie_logs WHERE user_id = ? ORDER BY date DESC LIMIT 60',
      [req.userId]
    );

    const decrypted = rows.map(r => {
      const total = decrypt(r.total_calories, req.userKey, 'number');
      const target = decrypt(r.calorie_target, req.userKey, 'number') || 2000;
      const meals = decrypt(r.meals, req.userKey, 'json') || [];
      const notes = decrypt(r.notes, req.userKey, 'string') || '';
      const deficit = target - total;

      return {
        id: r.id,
        date: r.date,
        total_calories: total,
        calorie_target: target,
        deficit,
        status: deficit >= 0 ? 'deficit' : 'surplus',
        meal_count: meals.length,
        meals,
        notes
      };
    });

    res.json(decrypted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calories/summary', verifyToken, requireAdmin, async (req, res) => {
  try {
    const userRow = await getQuery('SELECT daily_calorie_target FROM users WHERE id = ?', [req.userId]);
    const defaultTarget = userRow?.daily_calorie_target ? Number(userRow.daily_calorie_target) : 2000;

    const rows = await allQuery('SELECT * FROM calorie_logs WHERE user_id = ?', [req.userId]);
    const logMap = {};
    rows.forEach(r => {
      logMap[r.date] = {
        total: decrypt(r.total_calories, req.userKey, 'number'),
        target: decrypt(r.calorie_target, req.userKey, 'number') || defaultTarget
      };
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const todayLog = logMap[todayStr] || { total: 0, target: defaultTarget };
    const todayDeficit = todayLog.target - todayLog.total;

    // 7-day trend
    const sevenDayTrends = [];
    let weekSumCalories = 0;
    let weekDaysLogged = 0;
    let weekUnderTargetCount = 0;
    let weeklyNetDeficit = 0;

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });

      const dayData = logMap[dStr];
      const cal = dayData ? dayData.total : 0;
      const tgt = dayData ? dayData.target : defaultTarget;
      const def = tgt - cal;

      if (dayData && cal > 0) {
        weekSumCalories += cal;
        weekDaysLogged++;
        if (def >= 0) weekUnderTargetCount++;
        weeklyNetDeficit += def;
      }

      sevenDayTrends.push({
        date: dStr,
        day: dayLabel,
        calories: cal,
        target: tgt,
        deficit: def,
        status: def >= 0 ? 'deficit' : 'surplus',
        isLogged: !!dayData
      });
    }

    const weeklyAvgCalories = weekDaysLogged > 0 ? Math.round(weekSumCalories / weekDaysLogged) : 0;
    const weeklyAdherencePct = weekDaysLogged > 0 ? Math.round((weekUnderTargetCount / weekDaysLogged) * 100) : 100;

    // Month stats (current month)
    const monthPrefix = todayStr.substring(0, 7);
    let monthSumCalories = 0;
    let monthDaysLogged = 0;
    let monthlyNetDeficit = 0;

    Object.entries(logMap).forEach(([date, data]) => {
      if (date.startsWith(monthPrefix) && data.total > 0) {
        monthSumCalories += data.total;
        monthDaysLogged++;
        monthlyNetDeficit += (data.target - data.total);
      }
    });

    const monthlyAvgCalories = monthDaysLogged > 0 ? Math.round(monthSumCalories / monthDaysLogged) : 0;
    // 7700 kcal ~= 1 kg fat
    const projectedKgFatChange = Math.round((monthlyNetDeficit / 7700) * 10) / 10;

    // 4-Week Trend Analysis
    const weeklyBreakdowns = [];
    for (let w = 3; w >= 0; w--) {
      const now = new Date();
      const wEnd = new Date(now);
      wEnd.setDate(wEnd.getDate() - (w * 7));
      const wStart = new Date(wEnd);
      wStart.setDate(wStart.getDate() - 6);

      let wTotal = 0;
      let wCount = 0;
      let wDefSum = 0;

      for (let cur = new Date(wStart); cur <= wEnd; cur.setDate(cur.getDate() + 1)) {
        const cStr = cur.toISOString().split('T')[0];
        if (logMap[cStr] && logMap[cStr].total > 0) {
          wTotal += logMap[cStr].total;
          wCount++;
          wDefSum += (logMap[cStr].target - logMap[cStr].total);
        }
      }

      const wLabel = `${wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${wEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      weeklyBreakdowns.push({
        weekLabel: wLabel,
        avgCalories: wCount > 0 ? Math.round(wTotal / wCount) : 0,
        totalCalories: wTotal,
        netDeficit: wDefSum,
        loggedDays: wCount,
        isCurrentWeek: w === 0
      });
    }

    res.json({
      todayCalories: todayLog.total,
      todayTarget: todayLog.target,
      todayDeficit,
      todayStatus: todayDeficit >= 0 ? 'deficit' : 'surplus',
      weeklyAvgCalories,
      weeklyNetDeficit,
      weeklyAdherencePct,
      monthlyAvgCalories,
      monthlyNetDeficit,
      projectedKgFatChange,
      sevenDayTrends,
      weeklyBreakdowns,
      defaultTarget
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/calories/log/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM calorie_logs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Calorie log entry deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 11. ADDICTION TRACKER & ANALYSIS ENDPOINTS (Admin Only)
// ==========================================
const DEFAULT_HABITS = [
  { name: 'Cigarettes', category: 'substance', unit: 'cigarettes', daily_threshold: 0, cost_per_unit: 150, color: '#ef4444', icon: 'smoke_free' },
  { name: 'Phone Screen Time', category: 'digital', unit: 'minutes', daily_threshold: 120, cost_per_unit: 0, color: '#3b82f6', icon: 'smartphone' },
  { name: 'Overeating', category: 'behavioral', unit: 'episodes', daily_threshold: 0, cost_per_unit: 500, color: '#f59e0b', icon: 'restaurant' }
];

router.get('/addictions/habits', verifyToken, requireAdmin, async (req, res) => {
  try {
    let habits = await allQuery('SELECT * FROM addiction_habits WHERE user_id = ? ORDER BY id ASC', [req.userId]);

    // Seed defaults if empty
    if (habits.length === 0) {
      for (const h of DEFAULT_HABITS) {
        await runQuery(
          `INSERT INTO addiction_habits (user_id, name, category, unit, daily_threshold, cost_per_unit, color, icon)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.userId, h.name, h.category, h.unit, h.daily_threshold, h.cost_per_unit, h.color, h.icon]
        );
      }
      habits = await allQuery('SELECT * FROM addiction_habits WHERE user_id = ? ORDER BY id ASC', [req.userId]);
    }

    res.json(habits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/addictions/habits', verifyToken, requireAdmin, async (req, res) => {
  const { name, category, unit, daily_threshold, cost_per_unit, color, icon } = req.body;
  if (!name || !unit) return res.status(400).json({ error: 'Name and unit are required.' });

  try {
    const result = await runQuery(
      `INSERT INTO addiction_habits (user_id, name, category, unit, daily_threshold, cost_per_unit, color, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId,
        name.trim(),
        category || 'custom',
        unit.trim(),
        Number(daily_threshold) || 0,
        Number(cost_per_unit) || 0,
        color || '#6366f1',
        icon || 'healing'
      ]
    );
    res.status(201).json({ message: 'Habit added successfully.', habitId: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/addictions/habits/:id', verifyToken, requireAdmin, async (req, res) => {
  const { name, category, unit, daily_threshold, cost_per_unit, color, icon } = req.body;
  try {
    await runQuery(
      `UPDATE addiction_habits 
       SET name = ?, category = ?, unit = ?, daily_threshold = ?, cost_per_unit = ?, color = ?, icon = ?
       WHERE id = ? AND user_id = ?`,
      [
        name.trim(),
        category,
        unit.trim(),
        Number(daily_threshold) || 0,
        Number(cost_per_unit) || 0,
        color || '#6366f1',
        icon || 'healing',
        req.params.id,
        req.userId
      ]
    );
    res.json({ message: 'Habit updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/addictions/habits/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM addiction_logs WHERE habit_id = ? AND user_id = ?', [req.params.id, req.userId]);
    await runQuery('DELETE FROM addiction_habits WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Habit and logs deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/addictions/daily', verifyToken, requireAdmin, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const habits = await allQuery('SELECT * FROM addiction_habits WHERE user_id = ?', [req.userId]);

    const logs = await allQuery(
      'SELECT * FROM addiction_logs WHERE user_id = ? AND date = ?',
      [req.userId, targetDate]
    );

    const logByHabit = {};
    logs.forEach(l => {
      logByHabit[l.habit_id] = {
        id: l.id,
        quantity: decrypt(l.quantity, req.userKey, 'number'),
        trigger_context: decrypt(l.trigger_context, req.userKey, 'string') || '',
        craving_intensity: decrypt(l.craving_intensity, req.userKey, 'number') || 1,
        notes: decrypt(l.notes, req.userKey, 'string') || ''
      };
    });

    const result = habits.map(h => {
      const l = logByHabit[h.id];
      const qty = l ? l.quantity : 0;
      const withinThreshold = qty <= h.daily_threshold;
      return {
        habit_id: h.id,
        habit_name: h.name,
        category: h.category,
        unit: h.unit,
        daily_threshold: h.daily_threshold,
        cost_per_unit: h.cost_per_unit,
        color: h.color,
        icon: h.icon,
        date: targetDate,
        log_id: l ? l.id : null,
        quantity: qty,
        trigger_context: l ? l.trigger_context : '',
        craving_intensity: l ? l.craving_intensity : 1,
        notes: l ? l.notes : '',
        withinThreshold,
        isLogged: !!l
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/addictions/log', verifyToken, requireAdmin, async (req, res) => {
  const { habit_id, date, quantity, increment, trigger_context, craving_intensity, notes } = req.body;
  if (!habit_id) return res.status(400).json({ error: 'Habit ID is required.' });

  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const existing = await getQuery(
      'SELECT * FROM addiction_logs WHERE user_id = ? AND habit_id = ? AND date = ?',
      [req.userId, habit_id, targetDate]
    );

    let currentQty = existing ? decrypt(existing.quantity, req.userKey, 'number') : 0;
    let currentTrigger = existing ? (decrypt(existing.trigger_context, req.userKey, 'string') || '') : '';
    let currentCraving = existing ? (decrypt(existing.craving_intensity, req.userKey, 'number') || 1) : 1;
    let currentNotes = existing ? (decrypt(existing.notes, req.userKey, 'string') || '') : '';

    if (increment !== undefined && increment !== null) {
      currentQty = Math.max(0, currentQty + Number(increment));
    } else if (quantity !== undefined && quantity !== null) {
      currentQty = Math.max(0, Number(quantity));
    }

    if (trigger_context !== undefined) currentTrigger = trigger_context;
    if (craving_intensity !== undefined) currentCraving = Number(craving_intensity);
    if (notes !== undefined) currentNotes = notes;

    const encQty = encrypt(currentQty, req.userKey);
    const encTrigger = encrypt(currentTrigger, req.userKey);
    const encCraving = encrypt(currentCraving, req.userKey);
    const encNotes = encrypt(currentNotes, req.userKey);

    if (existing) {
      await runQuery(
        `UPDATE addiction_logs 
         SET quantity = ?, trigger_context = ?, craving_intensity = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [encQty, encTrigger, encCraving, encNotes, existing.id]
      );
    } else {
      await runQuery(
        `INSERT INTO addiction_logs (user_id, habit_id, date, quantity, trigger_context, craving_intensity, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.userId, habit_id, targetDate, encQty, encTrigger, encCraving, encNotes]
      );
    }

    res.json({ message: 'Habit logged successfully.', quantity: currentQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/addictions/analysis', verifyToken, requireAdmin, async (req, res) => {
  try {
    const habits = await allQuery('SELECT * FROM addiction_habits WHERE user_id = ?', [req.userId]);
    const rawLogs = await allQuery('SELECT * FROM addiction_logs WHERE user_id = ? ORDER BY date DESC', [req.userId]);

    const logs = rawLogs.map(l => ({
      id: l.id,
      habit_id: l.habit_id,
      date: l.date,
      quantity: decrypt(l.quantity, req.userKey, 'number'),
      trigger_context: decrypt(l.trigger_context, req.userKey, 'string') || '',
      craving_intensity: decrypt(l.craving_intensity, req.userKey, 'number') || 1,
      notes: decrypt(l.notes, req.userKey, 'string') || ''
    }));

    // Trigger analysis
    const triggerCounts = {};
    logs.forEach(l => {
      if (l.trigger_context && l.quantity > 0) {
        triggerCounts[l.trigger_context] = (triggerCounts[l.trigger_context] || 0) + 1;
      }
    });

    const topTriggers = Object.entries(triggerCounts)
      .map(([trigger, count]) => ({ trigger, count }))
      .sort((a, b) => b.count - a.count);

    // Per-habit analytics
    const habitStats = habits.map(h => {
      const hLogs = logs.filter(l => l.habit_id === h.id);
      const logMap = {};
      hLogs.forEach(l => { logMap[l.date] = l.quantity; });

      // Streak calculation (consecutive days <= daily_threshold ending today)
      let currentStreak = 0;
      let checkDate = new Date();
      while (true) {
        const dStr = checkDate.toISOString().split('T')[0];
        const val = logMap[dStr] !== undefined ? logMap[dStr] : 0;
        if (val <= h.daily_threshold) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
        if (currentStreak > 365) break;
      }

      // Past 7 days intake
      const sevenDays = [];
      let sevenDayTotal = 0;
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const qty = logMap[dStr] !== undefined ? logMap[dStr] : 0;
        sevenDayTotal += qty;
        sevenDays.push({
          date: dStr,
          day: dayName,
          quantity: qty,
          threshold: h.daily_threshold,
          withinThreshold: qty <= h.daily_threshold
        });
      }

      // Estimated savings (e.g. avoided units * cost)
      let moneySaved = 0;
      if (h.cost_per_unit > 0 && h.category === 'substance') {
        const baseline = 10;
        sevenDays.forEach(day => {
          const avoided = Math.max(0, baseline - day.quantity);
          moneySaved += avoided * h.cost_per_unit;
        });
      }

      return {
        habit: h,
        currentStreak,
        sevenDayAverage: Math.round((sevenDayTotal / 7) * 10) / 10,
        sevenDays,
        moneySaved,
        totalLogsCount: hLogs.length
      };
    });

    // Overall Habit Wellness Score (0-100)
    let wellnessScore = 85;
    if (habitStats.length > 0) {
      let withinGoalCount = 0;
      let totalChecks = 0;
      habitStats.forEach(hs => {
        hs.sevenDays.forEach(d => {
          totalChecks++;
          if (d.withinThreshold) withinGoalCount++;
        });
      });
      wellnessScore = totalChecks > 0 ? Math.round((withinGoalCount / totalChecks) * 100) : 100;
    }

    res.json({
      habitStats,
      topTriggers,
      wellnessScore,
      totalHabits: habits.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/addictions/log/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await runQuery('DELETE FROM addiction_logs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Addiction log deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
