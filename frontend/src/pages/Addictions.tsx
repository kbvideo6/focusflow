import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface HabitItem {
  id: number;
  name: string;
  category: 'substance' | 'digital' | 'behavioral' | 'custom';
  unit: string;
  daily_threshold: number;
  cost_per_unit: number;
  color: string;
  icon: string;
}

interface DailyHabitLog {
  habit_id: number;
  habit_name: string;
  category: string;
  unit: string;
  daily_threshold: number;
  cost_per_unit: number;
  color: string;
  icon: string;
  date: string;
  log_id: number | null;
  quantity: number;
  trigger_context: string;
  craving_intensity: number;
  notes: string;
  withinThreshold: boolean;
  isLogged: boolean;
}

interface HabitAnalysis {
  habitStats: {
    habit: HabitItem;
    currentStreak: number;
    sevenDayAverage: number;
    sevenDays: {
      date: string;
      day: string;
      quantity: number;
      threshold: number;
      withinThreshold: boolean;
    }[];
    moneySaved: number;
    totalLogsCount: number;
  }[];
  topTriggers: { trigger: string; count: number }[];
  wellnessScore: number;
  totalHabits: number;
}

const COMMON_TRIGGERS = [
  'Work Stress',
  'Boredom / Idle Time',
  'Late Night Solitude',
  'Social Gathering',
  'Emotional Anxiety',
  'Fatigue / Lack of Sleep',
  'Post-Meal Habit',
  'Procrastination'
];

export const Addictions: React.FC = () => {
  const { token, apiUrl } = useAuth();

  const [activeTab, setActiveTab] = useState<'today' | 'analysis' | 'habits'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Data states
  const [dailyLogs, setDailyLogs] = useState<DailyHabitLog[]>([]);
  const [analysis, setAnalysis] = useState<HabitAnalysis | null>(null);
  const [habitsList, setHabitsList] = useState<HabitItem[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Trigger & craving log modal
  const [activeHabitToLog, setActiveHabitToLog] = useState<DailyHabitLog | null>(null);
  const [logQtyInput, setLogQtyInput] = useState<number>(0);
  const [logTriggerInput, setLogTriggerInput] = useState<string>('');
  const [logCravingInput, setLogCravingInput] = useState<number>(3);
  const [logNotesInput, setLogNotesInput] = useState<string>('');

  // Add new habit modal
  const [showAddHabitModal, setShowAddHabitModal] = useState<boolean>(false);
  const [newHabitName, setNewHabitName] = useState<string>('');
  const [newHabitCategory, setNewHabitCategory] = useState<'substance' | 'digital' | 'behavioral' | 'custom'>('substance');
  const [newHabitUnit, setNewHabitUnit] = useState<string>('cigarettes');
  const [newHabitThreshold, setNewHabitThreshold] = useState<number>(0);
  const [newHabitCost, setNewHabitCost] = useState<number>(0);
  const [newHabitColor, setNewHabitColor] = useState<string>('#ef4444');
  const [newHabitIcon, setNewHabitIcon] = useState<string>('smoke_free');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const fetchDailyLogs = async (dateStr: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/addictions/daily?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDailyLogs(await res.json());
      }
    } catch (err) {
      console.error('Error fetching daily addiction logs:', err);
    }
  };

  const fetchAnalysisAndHabits = async () => {
    if (!token) return;
    try {
      const [anRes, hbRes] = await Promise.all([
        fetch(`${apiUrl}/tracker/addictions/analysis`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/tracker/addictions/habits`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (anRes.ok) setAnalysis(await anRes.json());
      if (hbRes.ok) setHabitsList(await hbRes.json());
    } catch (err) {
      console.error('Error fetching addiction analysis:', err);
    }
  };

  useEffect(() => {
    fetchDailyLogs(selectedDate);
    fetchAnalysisAndHabits();
  }, [token, selectedDate]);

  // Quick increment/decrement helper (+1 or -1 or custom)
  const handleQuickDelta = async (habit: DailyHabitLog, delta: number) => {
    if (!token) return;
    const newQty = Math.max(0, habit.quantity + delta);

    try {
      const res = await fetch(`${apiUrl}/tracker/addictions/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          habit_id: habit.habit_id,
          date: selectedDate,
          quantity: newQty
        })
      });

      if (res.ok) {
        showToast(`${habit.habit_name}: ${newQty} ${habit.unit}`);
        fetchDailyLogs(selectedDate);
        fetchAnalysisAndHabits();
      }
    } catch (err) {
      console.error('Quick delta error:', err);
    }
  };

  // Open detailed trigger log modal
  const openTriggerModal = (habit: DailyHabitLog) => {
    setActiveHabitToLog(habit);
    setLogQtyInput(habit.quantity);
    setLogTriggerInput(habit.trigger_context || '');
    setLogCravingInput(habit.craving_intensity || 3);
    setLogNotesInput(habit.notes || '');
  };

  // Save detailed log modal
  const handleSaveDetailedLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHabitToLog || !token) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/addictions/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          habit_id: activeHabitToLog.habit_id,
          date: selectedDate,
          quantity: Number(logQtyInput),
          trigger_context: logTriggerInput,
          craving_intensity: Number(logCravingInput),
          notes: logNotesInput
        })
      });

      if (res.ok) {
        showToast(`${activeHabitToLog.habit_name} log updated.`);
        setActiveHabitToLog(null);
        fetchDailyLogs(selectedDate);
        fetchAnalysisAndHabits();
      }
    } catch (err) {
      console.error('Save detailed log error:', err);
    }
  };

  // Create new custom habit
  const handleCreateHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitName || !token) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/addictions/habits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newHabitName.trim(),
          category: newHabitCategory,
          unit: newHabitUnit.trim(),
          daily_threshold: Number(newHabitThreshold),
          cost_per_unit: Number(newHabitCost),
          color: newHabitColor,
          icon: newHabitIcon
        })
      });

      if (res.ok) {
        showToast(`Habit "${newHabitName}" added.`);
        setShowAddHabitModal(false);
        setNewHabitName('');
        setNewHabitCost(0);
        fetchDailyLogs(selectedDate);
        fetchAnalysisAndHabits();
      }
    } catch (err) {
      console.error('Create habit error:', err);
    }
  };

  // Delete habit
  const handleDeleteHabit = async (id: number, name: string) => {
    if (!window.confirm(`Delete habit "${name}" and all historical tracking data?`)) return;
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/addictions/habits/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast(`Habit "${name}" deleted.`);
        fetchDailyLogs(selectedDate);
        fetchAnalysisAndHabits();
      }
    } catch (err) {
      console.error('Delete habit error:', err);
    }
  };

  // Total estimated money saved across all substance habits
  const totalMoneySaved = useMemo(() => {
    if (!analysis?.habitStats) return 0;
    return analysis.habitStats.reduce((acc, h) => acc + (h.moneySaved || 0), 0);
  }, [analysis]);

  return (
    <Layout title="Habits & Addiction Control">
      <div className="space-y-stack-lg animate-fade-in">
        {/* Toast */}
        {notification && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-center gap-2 animate-bounce ${
              notification.type === 'success'
                ? 'bg-secondary/10 border-secondary text-secondary'
                : 'bg-error-container border-error text-on-error-container'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {notification.type === 'success' ? 'check_circle' : 'error'}
            </span>
            {notification.message}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-bold text-on-background mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-error" style={{ fontSize: '32px' }}>healing</span>
              Addiction & Behavioral Control
            </h1>
            <p className="text-body-md text-outline">
              Track daily cigarette consumption, screen time, overeating impulses, and behavioral triggers with scientific relapse prevention analytics.
            </p>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant shadow-sm w-fit self-end">
            <button
              onClick={() => setActiveTab('today')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'today' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Today's Trackers
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'analysis' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">insights</span>
              Smart Analysis
            </button>
            <button
              onClick={() => setActiveTab('habits')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'habits' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>
              Habit Config
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KPI Cards Row (Wellness Score, Clean Streaks, Money Saved, Active Habits) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
          {/* Card 1: Wellness Score */}
          <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-outline mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Control Score</span>
              <span className="material-symbols-outlined text-secondary text-sm">shield</span>
            </div>
            <div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-display-lg-mobile font-bold font-data-tabular text-on-background">
                  {analysis?.wellnessScore || 85}
                </span>
                <span className="text-sm font-bold text-outline">/ 100</span>
              </div>
              <p className="text-xs text-on-surface-variant font-medium mt-1">
                {(analysis?.wellnessScore || 85) >= 80 ? '🟢 Strong impulse resistance' : '🟡 Caution: elevated slips this week'}
              </p>
            </div>
            <div className="mt-4 pt-2 border-t border-outline-variant/30 text-[11px] text-outline flex justify-between">
              <span>Goal: 100% adherence</span>
              <span>7-Day window</span>
            </div>
          </div>

          {/* Card 2: Cigarette Control & Streaks */}
          <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-error mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Cigarette Intake</span>
              <span className="material-symbols-outlined text-sm">smoke_free</span>
            </div>
            <div>
              {(() => {
                const cigHabit = dailyLogs.find(h => h.habit_name.toLowerCase().includes('cigarette'));
                const qty = cigHabit ? cigHabit.quantity : 0;
                return (
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-display-lg-mobile font-bold font-data-tabular ${qty === 0 ? 'text-secondary' : 'text-error'}`}>
                        {qty}
                      </span>
                      <span className="text-sm font-bold text-outline">smoked today</span>
                    </div>
                    <p className="text-xs text-on-surface-variant font-medium mt-1">
                      {qty === 0 ? 'Smoke-free clean day preserved!' : `Target is 0 cigarettes`}
                    </p>
                  </div>
                );
              })()}
            </div>
            <div className="mt-4 pt-2 border-t border-outline-variant/30 text-[11px] text-outline flex justify-between">
              <span>Streak: {analysis?.habitStats?.find(h => h.habit.name.toLowerCase().includes('cigarette'))?.currentStreak || 0} days</span>
              <span>Zero-tolerance goal</span>
            </div>
          </div>

          {/* Card 3: Screen Time Watch */}
          <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-primary mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Phone Screen Watch</span>
              <span className="material-symbols-outlined text-sm">smartphone</span>
            </div>
            <div>
              {(() => {
                const screenHabit = dailyLogs.find(h => h.habit_name.toLowerCase().includes('screen') || h.habit_name.toLowerCase().includes('phone'));
                const mins = screenHabit ? screenHabit.quantity : 0;
                const hours = (mins / 60).toFixed(1);
                const isOver = mins > (screenHabit?.daily_threshold || 120);
                return (
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-display-lg-mobile font-bold font-data-tabular ${isOver ? 'text-error' : 'text-on-background'}`}>
                        {hours}h
                      </span>
                      <span className="text-sm font-bold text-outline font-data-tabular">({mins} mins)</span>
                    </div>
                    <p className="text-xs text-on-surface-variant font-medium mt-1">
                      {isOver ? `Over daily limit of ${screenHabit?.daily_threshold}m` : `Within ${screenHabit?.daily_threshold || 120}m ceiling`}
                    </p>
                  </div>
                );
              })()}
            </div>
            <div className="mt-4 pt-2 border-t border-outline-variant/30 text-[11px] text-outline flex justify-between">
              <span>Digital Detox</span>
              <span>Daily ceiling</span>
            </div>
          </div>

          {/* Card 4: Estimated Financial Savings */}
          <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-secondary mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Estimated Savings</span>
              <span className="material-symbols-outlined text-sm">savings</span>
            </div>
            <div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-display-lg-mobile font-bold font-data-tabular text-secondary">
                  +{totalMoneySaved.toLocaleString()}
                </span>
                <span className="text-sm font-bold text-outline">LKR</span>
              </div>
              <p className="text-xs text-on-surface-variant font-medium mt-1">
                Retained by avoiding unneeded cigarettes & impulse purchases.
              </p>
            </div>
            <div className="mt-4 pt-2 border-t border-outline-variant/30 text-[11px] text-outline flex justify-between">
              <span>Financial Freedom</span>
              <span>Weekly rolling</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Tab 1: Today's Trackers */}
        {/* ========================================================================= */}
        {activeTab === 'today' && (
          <div className="space-y-6">
            {/* Date Selector Row */}
            <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">calendar_today</span>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Daily Habit Log Date</h3>
                  <p className="text-[11px] text-outline">Log your daily intake or record behavioral triggers for this date.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="p-1.5 border border-outline-variant rounded-lg hover:bg-surface-container text-outline"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-[#f8f9ff] border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary"
                />

                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="p-1.5 border border-outline-variant rounded-lg hover:bg-surface-container text-outline"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                  className="px-3 py-1.5 bg-surface-container rounded-lg text-xs font-bold text-primary hover:bg-primary hover:text-white transition-colors"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Habit Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
              {dailyLogs.map((h) => {
                const isClean = h.quantity <= h.daily_threshold;
                const isScreen = h.unit === 'minutes';

                return (
                  <div
                    key={h.habit_id}
                    className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-all relative overflow-hidden"
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ backgroundColor: h.color || '#4f46e5' }}
                    ></div>

                    <div>
                      {/* Card Header */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                            style={{ backgroundColor: h.color || '#4f46e5' }}
                          >
                            <span className="material-symbols-outlined text-lg">{h.icon || 'healing'}</span>
                          </div>
                          <div>
                            <h4 className="text-body-md font-bold text-on-surface leading-tight">{h.habit_name}</h4>
                            <span className="text-[10px] text-outline font-medium uppercase tracking-wider block mt-0.5">
                              {h.category} · Target: ≤ {h.daily_threshold} {h.unit}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isClean ? 'bg-secondary/15 text-secondary' : 'bg-error-container text-on-error-container'
                          }`}
                        >
                          {isClean ? 'Clean Goal' : 'Over Limit'}
                        </span>
                      </div>

                      {/* Quantity Display */}
                      <div className="my-4 p-4 bg-[#f8f9ff] rounded-xl border border-outline-variant/40 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-outline uppercase font-bold block">Consumed Today</span>
                          <span className={`text-display-lg-mobile font-bold font-data-tabular ${isClean ? 'text-on-background' : 'text-error'}`}>
                            {h.quantity}
                          </span>
                          <span className="text-xs text-outline font-semibold ml-1">{h.unit}</span>
                        </div>

                        {/* Quick increment buttons */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuickDelta(h, isScreen ? -15 : -1)}
                            className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-bold flex items-center justify-center text-sm transition-colors"
                            title={isScreen ? '-15 minutes' : '-1 unit'}
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDelta(h, isScreen ? 15 : 1)}
                            className="w-8 h-8 rounded-lg bg-primary text-white font-bold flex items-center justify-center text-sm shadow-xs hover:opacity-95 transition-opacity"
                            title={isScreen ? '+15 minutes' : '+1 unit'}
                          >
                            +
                          </button>
                          {isScreen && (
                            <button
                              type="button"
                              onClick={() => handleQuickDelta(h, 30)}
                              className="px-2 h-8 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px] transition-colors"
                              title="+30 minutes"
                            >
                              +30m
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Logged context / trigger */}
                      {h.trigger_context && (
                        <div className="p-2.5 bg-surface-container-low rounded-lg text-xs border border-outline-variant/30 space-y-1 mb-2">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-outline font-medium">Trigger Context:</span>
                            <span className="font-bold text-on-surface">{h.trigger_context}</span>
                          </div>
                          {h.craving_intensity > 0 && (
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-outline font-medium">Craving Severity:</span>
                              <span className="font-bold text-error">Level {h.craving_intensity} / 5</span>
                            </div>
                          )}
                          {h.notes && (
                            <p className="text-[11px] text-on-surface-variant italic pt-1 border-t border-outline-variant/20">
                              "{h.notes}"
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-3 border-t border-outline-variant/30 flex justify-between items-center text-xs">
                      <span className="text-outline font-data-tabular">
                        Cost: {h.cost_per_unit > 0 ? `${(h.quantity * h.cost_per_unit).toLocaleString()} LKR` : '0 LKR'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openTriggerModal(h)}
                        className="text-primary hover:text-primary/80 font-bold flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">edit_note</span>
                        Log Trigger & Craving
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 2: Smart Behavioral Analysis */}
        {/* ========================================================================= */}
        {activeTab === 'analysis' && analysis && (
          <div className="space-y-6 animate-fade-in">
            {/* Top Row: Habit Clean Streaks & 7-Day Performance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              {/* Clean Streaks Card */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
                <h3 className="text-headline-md font-bold text-on-background mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">local_fire_department</span>
                  Impulse Sobriety & Goal Streaks
                </h3>
                <p className="text-xs text-on-surface-variant mb-4">
                  Consecutive days maintaining intake at or below your daily threshold.
                </p>

                <div className="space-y-3">
                  {analysis.habitStats.map((hs) => (
                    <div
                      key={hs.habit.id}
                      className="p-3.5 bg-[#f8f9ff] border border-outline-variant/50 rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: hs.habit.color }}
                        >
                          <span className="material-symbols-outlined text-sm">{hs.habit.icon}</span>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-on-surface">{hs.habit.name}</h4>
                          <span className="text-[10px] text-outline font-data-tabular">
                            7-Day Avg: {hs.sevenDayAverage} {hs.habit.unit} / day
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-headline-md font-bold text-secondary font-data-tabular block">
                          {hs.currentStreak}
                        </span>
                        <span className="text-[10px] text-outline uppercase font-bold">Days Clean</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trigger Analysis Card */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
                <h3 className="text-headline-md font-bold text-on-background mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">psychology</span>
                  Primary Behavioral Triggers
                </h3>
                <p className="text-xs text-on-surface-variant mb-4">
                  Identified contexts triggering relapses or craving spikes.
                </p>

                {analysis.topTriggers.length === 0 ? (
                  <div className="text-center py-10 text-on-surface-variant">
                    <span className="material-symbols-outlined text-outline text-3xl">mood</span>
                    <p className="text-xs font-semibold mt-1">No trigger contexts recorded yet.</p>
                    <p className="text-[11px] text-outline">Click "Log Trigger & Craving" when recording habits to map impulses.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analysis.topTriggers.slice(0, 5).map((t, idx) => {
                      const maxCount = analysis.topTriggers[0]?.count || 1;
                      const pct = Math.round((t.count / maxCount) * 100);

                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-on-surface">{t.trigger}</span>
                            <span className="text-primary font-bold font-data-tabular">{t.count} occurrences</span>
                          </div>
                          <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 7-Day Trajectory Grid for Each Habit */}
            <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
              <h3 className="text-headline-md font-bold text-on-background mb-1 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">analytics</span>
                7-Day Intake Trajectories
              </h3>
              <p className="text-xs text-on-surface-variant mb-6">
                Comparison of daily consumed units across the rolling week against zero / reduction goals.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {analysis.habitStats.map((hs) => (
                  <div key={hs.habit.id} className="p-4 bg-[#f8f9ff] border border-outline-variant/60 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hs.habit.color }}></span>
                        {hs.habit.name}
                      </span>
                      <span className="text-[10px] text-outline font-data-tabular">
                        Goal: ≤{hs.habit.daily_threshold} {hs.habit.unit}
                      </span>
                    </div>

                    {/* Micro bar chart */}
                    <div className="grid grid-cols-7 gap-1.5 h-24 items-end pt-3">
                      {hs.sevenDays.map((d, i) => {
                        const maxVal = Math.max(...hs.sevenDays.map(x => x.quantity), hs.habit.daily_threshold || 1, 5);
                        const heightPct = Math.min(100, Math.max(8, Math.round((d.quantity / maxVal) * 100)));
                        const isGoal = d.withinThreshold;

                        return (
                          <div key={i} className="flex flex-col items-center h-full justify-end group">
                            <div
                              className={`w-full rounded-t transition-all ${
                                d.quantity === 0
                                  ? 'bg-secondary/40 h-2'
                                  : isGoal
                                  ? 'bg-secondary'
                                  : 'bg-error'
                              }`}
                              style={{ height: `${heightPct}%` }}
                              title={`${d.day}: ${d.quantity} ${hs.habit.unit}`}
                            ></div>
                            <span className="text-[9px] text-outline mt-1 font-semibold">{d.day.substring(0, 1)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 3: Habit Configuration */}
        {/* ========================================================================= */}
        {activeTab === 'habits' && (
          <div className="bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-outline-variant bg-surface-bright flex justify-between items-center">
              <div>
                <h3 className="text-headline-md font-bold text-on-background">Tracked Addictions & Habits</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Customize daily thresholds, cost parameters, and icons for each behavior.</p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddHabitModal(true)}
                className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-sm hover:opacity-95 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Custom Habit
              </button>
            </div>

            <div className="divide-y divide-outline-variant/30">
              {habitsList.map((h) => (
                <div key={h.id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-[#f8f9ff] transition-colors">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
                      style={{ backgroundColor: h.color }}
                    >
                      <span className="material-symbols-outlined">{h.icon}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-on-surface">{h.name}</h4>
                      <p className="text-xs text-outline font-medium">
                        Category: <strong className="text-on-surface-variant uppercase">{h.category}</strong> · Unit: <strong>{h.unit}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-left sm:text-right">
                      <span className="text-xs font-bold text-on-surface font-data-tabular block">
                        Limit: ≤ {h.daily_threshold} {h.unit} / day
                      </span>
                      <span className="text-[11px] text-outline font-data-tabular block">
                        Cost: {h.cost_per_unit > 0 ? `${h.cost_per_unit} LKR / ${h.unit}` : 'No financial cost'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteHabit(h.id, h.name)}
                      className="text-outline hover:text-error p-2 rounded-lg hover:bg-error-container/20 transition-colors"
                      title="Delete Habit"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal: Detailed Trigger & Craving Log */}
        {activeHabitToLog && (
          <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative animate-fade-in">
              <div
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ backgroundColor: activeHabitToLog.color || '#4f46e5' }}
              ></div>

              <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">{activeHabitToLog.icon}</span>
                    Log {activeHabitToLog.habit_name}
                  </h3>
                  <p className="text-xs text-outline mt-0.5">{selectedDate}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveHabitToLog(null)}
                  className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleSaveDetailedLog} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Consumed Quantity ({activeHabitToLog.unit})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={logQtyInput}
                    onChange={(e) => setLogQtyInput(Number(e.target.value))}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-base font-bold font-data-tabular focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Behavioral Trigger Context
                  </label>
                  <select
                    value={logTriggerInput}
                    onChange={(e) => setLogTriggerInput(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary focus:outline-none mb-2"
                  >
                    <option value="">Select or type trigger below...</option>
                    {COMMON_TRIGGERS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={logTriggerInput}
                    onChange={(e) => setLogTriggerInput(e.target.value)}
                    placeholder="Or enter custom trigger context..."
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2 text-xs text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                      Craving Urge Severity (1 to 5)
                    </label>
                    <span className="text-xs font-bold text-error font-data-tabular">Level {logCravingInput} / 5</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={logCravingInput}
                    onChange={(e) => setLogCravingInput(Number(e.target.value))}
                    className="w-full accent-error cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-outline font-medium mt-1">
                    <span>1: Mild impulse</span>
                    <span>3: Moderate pull</span>
                    <span>5: Overwhelming urge</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Reflection / Relapse Notes
                  </label>
                  <textarea
                    rows={2}
                    value={logNotesInput}
                    onChange={(e) => setLogNotesInput(e.target.value)}
                    placeholder="What emotion preceded this? What could prevent it next time?"
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                  ></textarea>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setActiveHabitToLog(null)}
                    className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-bold text-on-surface hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-95 shadow-sm"
                  >
                    Save Reflection
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Custom Habit */}
        {showAddHabitModal && (
          <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative animate-fade-in">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>

              <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background">Add Custom Addiction / Habit</h3>
                  <p className="text-xs text-outline mt-0.5">Track any substance or behavioral habit.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddHabitModal(false)}
                  className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateHabit} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Habit Name
                  </label>
                  <input
                    type="text"
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    placeholder="e.g. Alcohol, Vaping, Gaming, Caffeine"
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <select
                      value={newHabitCategory}
                      onChange={(e) => setNewHabitCategory(e.target.value as any)}
                      className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="substance">Substance (Smoking/Alcohol)</option>
                      <option value="digital">Digital (Screen/Gaming)</option>
                      <option value="behavioral">Behavioral (Food/Compulsion)</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Measurement Unit
                    </label>
                    <input
                      type="text"
                      value={newHabitUnit}
                      onChange={(e) => setNewHabitUnit(e.target.value)}
                      placeholder="e.g. drinks, minutes, episodes"
                      className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Daily Max Limit (Threshold)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newHabitThreshold}
                      onChange={(e) => setNewHabitThreshold(Number(e.target.value))}
                      placeholder="0 for zero tolerance"
                      className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs font-bold font-data-tabular focus:ring-2 focus:ring-primary focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Cost per Unit (LKR)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newHabitCost}
                      onChange={(e) => setNewHabitCost(Number(e.target.value))}
                      placeholder="e.g. 150"
                      className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs font-bold font-data-tabular focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Theme Color
                    </label>
                    <input
                      type="color"
                      value={newHabitColor}
                      onChange={(e) => setNewHabitColor(e.target.value)}
                      className="w-full h-10 border border-outline-variant rounded-lg p-1 cursor-pointer bg-[#f8f9ff]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Material Icon
                    </label>
                    <select
                      value={newHabitIcon}
                      onChange={(e) => setNewHabitIcon(e.target.value)}
                      className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="smoke_free">smoke_free (Smoking)</option>
                      <option value="smartphone">smartphone (Screen Time)</option>
                      <option value="restaurant">restaurant (Overeating)</option>
                      <option value="local_bar">local_bar (Alcohol)</option>
                      <option value="sports_esports">sports_esports (Gaming)</option>
                      <option value="coffee">coffee (Caffeine)</option>
                      <option value="casino">casino (Gambling)</option>
                      <option value="healing">healing (Generic Habit)</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setShowAddHabitModal(false)}
                    className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-bold text-on-surface hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-95 shadow-sm"
                  >
                    Create Habit
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
