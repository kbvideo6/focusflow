import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface MealItem {
  id: string;
  name: string;
  calories: number;
  time: string;
  notes?: string;
}

interface CalorieLog {
  id: number;
  date: string;
  total_calories: number;
  calorie_target: number;
  deficit: number;
  status: 'deficit' | 'surplus';
  meal_count: number;
  meals: MealItem[];
  notes?: string;
}

interface CalorieSummary {
  todayCalories: number;
  todayTarget: number;
  todayDeficit: number;
  todayStatus: 'deficit' | 'surplus';
  weeklyAvgCalories: number;
  weeklyNetDeficit: number;
  weeklyAdherencePct: number;
  monthlyAvgCalories: number;
  monthlyNetDeficit: number;
  projectedKgFatChange: number;
  defaultTarget: number;
  sevenDayTrends: {
    date: string;
    day: string;
    calories: number;
    target: number;
    deficit: number;
    status: 'deficit' | 'surplus';
    isLogged: boolean;
  }[];
  weeklyBreakdowns: {
    weekLabel: string;
    avgCalories: number;
    totalCalories: number;
    netDeficit: number;
    loggedDays: number;
    isCurrentWeek: boolean;
  }[];
}

export const Calories: React.FC = () => {
  const { token, apiUrl, user } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'history'>('overview');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [entryMode, setEntryMode] = useState<'endOfDay' | 'byMeal'>('endOfDay');

  // Daily log state for selectedDate
  const [totalCaloriesInput, setTotalCaloriesInput] = useState<string>('');
  const [calorieTargetInput, setCalorieTargetInput] = useState<number>(user?.daily_calorie_target || 2000);
  const [dayNotes, setDayNotes] = useState<string>('');
  const [dayMeals, setDayMeals] = useState<MealItem[]>([]);

  // New Meal form state
  const [newMealName, setNewMealName] = useState<string>('Lunch');
  const [newMealCalories, setNewMealCalories] = useState<string>('');
  const [newMealNotes, setNewMealNotes] = useState<string>('');

  // Summary & History states
  const [summary, setSummary] = useState<CalorieSummary | null>(null);
  const [history, setHistory] = useState<CalorieLog[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Editing history item modal
  const [editingItem, setEditingItem] = useState<CalorieLog | null>(null);
  const [editTotalInput, setEditTotalInput] = useState<number>(0);
  const [editTargetInput, setEditTargetInput] = useState<number>(2000);
  const [editNotesInput, setEditNotesInput] = useState<string>('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const fetchDailyLog = async (dateStr: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/calories/daily?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTotalCaloriesInput(data.total_calories > 0 ? String(data.total_calories) : '');
        setCalorieTargetInput(data.calorie_target || user?.daily_calorie_target || 2000);
        setDayMeals(data.meals || []);
        setDayNotes(data.notes || '');
      }
    } catch (err) {
      console.error('Error fetching daily calorie log:', err);
    }
  };

  const fetchSummaryAndHistory = async () => {
    if (!token) return;
    try {
      const [sumRes, histRes] = await Promise.all([
        fetch(`${apiUrl}/tracker/calories/summary`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/tracker/calories/history`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (histRes.ok) setHistory(await histRes.json());
    } catch (err) {
      console.error('Error fetching calorie summary/history:', err);
    }
  };

  useEffect(() => {
    fetchDailyLog(selectedDate);
    fetchSummaryAndHistory();
  }, [token, selectedDate]);

  // Handle End-of-Day single total submission
  const handleSaveEndOfDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const parsedTotal = Number(totalCaloriesInput);
    if (isNaN(parsedTotal) || parsedTotal < 0) {
      showToast('Please enter a valid calorie quantity.', 'error');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/tracker/calories/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: selectedDate,
          total_calories: parsedTotal,
          calorie_target: calorieTargetInput,
          notes: dayNotes
        })
      });

      if (res.ok) {
        showToast(`Logged ${parsedTotal} kcal for ${selectedDate}.`);
        fetchDailyLog(selectedDate);
        fetchSummaryAndHistory();
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Failed to save calories.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error.', 'error');
    }
  };

  // Handle adding an individual meal (breakfast, lunch, etc.)
  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const parsedCal = Number(newMealCalories);
    if (isNaN(parsedCal) || parsedCal <= 0) {
      showToast('Please enter a valid positive meal calorie count.', 'error');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/tracker/calories/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: selectedDate,
          calorie_target: calorieTargetInput,
          meal: {
            name: newMealName,
            calories: parsedCal,
            notes: newMealNotes
          }
        })
      });

      if (res.ok) {
        showToast(`Added ${newMealName} (${parsedCal} kcal).`);
        setNewMealCalories('');
        setNewMealNotes('');
        fetchDailyLog(selectedDate);
        fetchSummaryAndHistory();
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Failed to add meal.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error.', 'error');
    }
  };

  // Remove individual meal from today
  const handleRemoveMeal = async (mealId: string) => {
    if (!token) return;
    const updatedMeals = dayMeals.filter(m => m.id !== mealId);
    const newTotal = updatedMeals.reduce((acc, m) => acc + m.calories, 0);

    try {
      const res = await fetch(`${apiUrl}/tracker/calories/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: selectedDate,
          total_calories: newTotal,
          calorie_target: calorieTargetInput,
          meals: updatedMeals,
          notes: dayNotes
        })
      });

      if (res.ok) {
        showToast('Meal removed.');
        fetchDailyLog(selectedDate);
        fetchSummaryAndHistory();
      }
    } catch (err) {
      console.error('Failed to remove meal:', err);
    }
  };

  // Delete an entire day log from history
  const handleDeleteLog = async (id: number) => {
    if (!window.confirm('Delete this calorie log entry?')) return;
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/calories/log/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Calorie log deleted.');
        fetchDailyLog(selectedDate);
        fetchSummaryAndHistory();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Save edit modal
  const handleSaveModalEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !token) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/calories/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: editingItem.date,
          total_calories: editTotalInput,
          calorie_target: editTargetInput,
          notes: editNotesInput
        })
      });

      if (res.ok) {
        showToast('Calorie entry updated.');
        setEditingItem(null);
        fetchDailyLog(selectedDate);
        fetchSummaryAndHistory();
      }
    } catch (err) {
      console.error('Save edit error:', err);
    }
  };

  const openEditModal = (item: CalorieLog) => {
    setEditingItem(item);
    setEditTotalInput(item.total_calories);
    setEditTargetInput(item.calorie_target || 2000);
    setEditNotesInput(item.notes || '');
  };

  // Computed deficit values for current date view
  const currentTotalNumber = Number(totalCaloriesInput) || 0;
  const currentDeficit = calorieTargetInput - currentTotalNumber;
  const isCurrentDeficit = currentDeficit >= 0;
  const progressPct = Math.min(100, Math.round((currentTotalNumber / Math.max(1, calorieTargetInput)) * 100));

  // Filter history
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const matchSearch =
        item.date.includes(searchTerm) ||
        (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchSearch;
    });
  }, [history, searchTerm]);

  // Max value in 7-day trend for chart scaling
  const maxChartCalorie = useMemo(() => {
    if (!summary?.sevenDayTrends || summary.sevenDayTrends.length === 0) return 2500;
    const maxVal = Math.max(...summary.sevenDayTrends.map(t => Math.max(t.calories, t.target)), 2000);
    return maxVal * 1.15;
  }, [summary]);

  return (
    <Layout title="Calories & Energy Balance">
      <div className="space-y-stack-lg animate-fade-in">
        {/* Toast Notification */}
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

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-bold text-on-background mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>nutrition</span>
              Calorie & Deficit Tracker
            </h1>
            <p className="text-body-md text-outline">
              Target a daily energy limit, monitor cumulative deficits, and track long-term fat loss or maintenance trends.
            </p>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant shadow-sm w-fit self-end">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'overview' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Today & Logging
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'analysis' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">monitoring</span>
              Smart Analysis
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'history' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              Past Logs
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KPI Cards Row (Deficit Gauge, Consumed / Limit, Weekly Average, Fat Projection) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
          {/* Card 1: Today's Deficit / Surplus Status */}
          <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-outline mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Energy Balance</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isCurrentDeficit ? 'bg-secondary/15 text-secondary' : 'bg-error-container text-on-error-container'
              }`}>
                {isCurrentDeficit ? 'In Deficit' : 'Surplus'}
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-display-lg-mobile font-bold font-data-tabular ${
                  isCurrentDeficit ? 'text-secondary' : 'text-error'
                }`}>
                  {isCurrentDeficit ? `-${currentDeficit}` : `+${Math.abs(currentDeficit)}`}
                </span>
                <span className="text-sm font-bold text-outline">kcal</span>
              </div>
              <p className="text-xs text-on-surface-variant font-medium mt-1">
                {isCurrentDeficit
                  ? `${currentDeficit} kcal under target (Fat loss runway)`
                  : `${Math.abs(currentDeficit)} kcal over daily maintenance limit`}
              </p>
            </div>
            <div className="mt-4 pt-2 border-t border-outline-variant/30 text-[11px] text-outline flex justify-between">
              <span>Target: {calorieTargetInput} kcal</span>
              <span>Consumed: {currentTotalNumber} kcal</span>
            </div>
          </div>

          {/* Card 2: Daily Allowance Meter */}
          <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-primary mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Daily Intake Meter</span>
              <span className="text-xs font-bold font-data-tabular text-outline">{progressPct}%</span>
            </div>
            <div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-display-lg-mobile font-bold font-data-tabular text-on-background">
                  {currentTotalNumber}
                </span>
                <span className="text-sm font-bold text-outline">/ {calorieTargetInput} kcal</span>
              </div>
              <div className="w-full bg-surface-container h-2.5 rounded-full overflow-hidden mt-3">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    currentTotalNumber > calorieTargetInput ? 'bg-error' : 'bg-primary'
                  }`}
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-outline-variant/30 text-[11px] text-outline flex justify-between">
              <span>{Math.max(0, calorieTargetInput - currentTotalNumber)} kcal left</span>
              <span>{dayMeals.length} meals logged</span>
            </div>
          </div>

          {/* Card 3: Weekly Average Intake */}
          <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-outline mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">7-Day Rolling Average</span>
              <span className="material-symbols-outlined text-sm text-tertiary">calendar_view_week</span>
            </div>
            <div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-display-lg-mobile font-bold font-data-tabular text-on-background">
                  {summary?.weeklyAvgCalories || 0}
                </span>
                <span className="text-sm font-bold text-outline">kcal / day</span>
              </div>
              <p className="text-xs text-on-surface-variant font-medium mt-1">
                Net weekly deficit: <strong className="text-secondary font-data-tabular font-bold">
                  {summary?.weeklyNetDeficit ? `${summary.weeklyNetDeficit} kcal` : '0 kcal'}
                </strong>
              </p>
            </div>
            <div className="mt-4 pt-2 border-t border-outline-variant/30 text-[11px] text-outline flex justify-between">
              <span>Adherence: {summary?.weeklyAdherencePct || 100}%</span>
              <span>7-Day Window</span>
            </div>
          </div>

          {/* Card 4: Monthly Fat Shift Projection */}
          <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-outline mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Projected Weight Shift</span>
              <span className="material-symbols-outlined text-sm text-secondary">scale</span>
            </div>
            <div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-display-lg-mobile font-bold font-data-tabular ${
                  (summary?.projectedKgFatChange || 0) >= 0 ? 'text-secondary' : 'text-primary'
                }`}>
                  {(summary?.projectedKgFatChange || 0) >= 0 ? `-${summary?.projectedKgFatChange}` : `+${Math.abs(summary?.projectedKgFatChange || 0)}`}
                </span>
                <span className="text-sm font-bold text-outline">kg fat (est)</span>
              </div>
              <p className="text-xs text-on-surface-variant font-medium mt-1">
                Month-to-date deficit: <strong className="text-on-surface font-data-tabular">{summary?.monthlyNetDeficit || 0} kcal</strong>
              </p>
            </div>
            <div className="mt-4 pt-2 border-t border-outline-variant/30 text-[11px] text-outline flex justify-between">
              <span>Scientific 7,700 kcal / kg rule</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Tab 1: Today & Logging */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
            {/* Left Column: Entry Form */}
            <div className="md:col-span-6 bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-center pb-3 border-b border-outline-variant/40">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background border-l-4 border-primary pl-3">
                    Daily Calorie Input
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Log total intake once at the end of the day, or record individual meals as you go.
                  </p>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-[#f8f9ff] border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Mode Toggle (End-of-day vs By Meal) */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-surface-container rounded-xl">
                <button
                  type="button"
                  onClick={() => setEntryMode('endOfDay')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    entryMode === 'endOfDay'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">done_all</span>
                  End of Day Total
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('byMeal')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    entryMode === 'byMeal'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">restaurant</span>
                  Meal by Meal (2-3x)
                </button>
              </div>

              {/* MODE 1: Single End-of-Day Total Input */}
              {entryMode === 'endOfDay' && (
                <form onSubmit={handleSaveEndOfDay} className="space-y-5 animate-fade-in">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Total Consumed Calories (kcal)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="15000"
                        step="10"
                        value={totalCaloriesInput}
                        onChange={(e) => setTotalCaloriesInput(e.target.value)}
                        placeholder="e.g. 1850"
                        className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-stat-value font-bold font-data-tabular focus:ring-2 focus:ring-primary focus:outline-none"
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-data-tabular font-bold text-sm">
                        kcal
                      </span>
                    </div>

                    {/* Quick increment adder chips */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {[100, 250, 500].map(inc => (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => setTotalCaloriesInput(prev => String((Number(prev) || 0) + inc))}
                          className="px-2.5 py-1 bg-surface-container hover:bg-surface-container-high rounded text-xs font-semibold text-primary transition-colors"
                        >
                          +{inc} kcal
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTotalCaloriesInput('')}
                        className="px-2.5 py-1 bg-error-container/20 hover:bg-error-container/40 text-error rounded text-xs font-semibold transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Daily Calorie Limit / Target (kcal)
                    </label>
                    <input
                      type="number"
                      min="500"
                      max="10000"
                      step="50"
                      value={calorieTargetInput}
                      onChange={(e) => setCalorieTargetInput(Number(e.target.value))}
                      className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm font-bold font-data-tabular focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Daily Nutrition Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={dayNotes}
                      onChange={(e) => setDayNotes(e.target.value)}
                      placeholder="e.g. High protein day, low carb dinner, 3L water consumed."
                      className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-primary text-white py-3 rounded-xl text-sm font-bold shadow-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    Save End of Day Calorie Log
                  </button>
                </form>
              )}

              {/* MODE 2: Meal-by-Meal Input */}
              {entryMode === 'byMeal' && (
                <form onSubmit={handleAddMeal} className="space-y-4 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                        Meal / Snack
                      </label>
                      <select
                        value={newMealName}
                        onChange={(e) => setNewMealName(e.target.value)}
                        className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                      >
                        <option value="Breakfast">Breakfast</option>
                        <option value="Morning Snack">Morning Snack</option>
                        <option value="Lunch">Lunch</option>
                        <option value="Afternoon Snack">Afternoon Snack</option>
                        <option value="Pre-Workout">Pre-Workout Meal</option>
                        <option value="Post-Workout">Post-Workout Shake</option>
                        <option value="Dinner">Dinner</option>
                        <option value="Late Night Snack">Late Night Snack</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                        Calories (kcal)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="5000"
                        value={newMealCalories}
                        onChange={(e) => setNewMealCalories(e.target.value)}
                        placeholder="e.g. 650"
                        className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm font-bold font-data-tabular focus:ring-2 focus:ring-primary focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      Food Details / Items (Optional)
                    </label>
                    <input
                      type="text"
                      value={newMealNotes}
                      onChange={(e) => setNewMealNotes(e.target.value)}
                      placeholder="e.g. Chicken breast, brown rice, broccoli, olive oil"
                      className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-secondary text-white py-2.5 rounded-xl text-xs font-bold shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add Meal to Today's Total
                  </button>
                </form>
              )}
            </div>

            {/* Right Column: Today's Status & Meals Breakdown */}
            <div className="md:col-span-6 space-y-4">
              {/* Daily Energy Breakdown Summary Card */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center pb-3 border-b border-outline-variant/40">
                  <h4 className="text-body-md font-bold text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">bolt</span>
                    Energy Balance Status for {selectedDate}
                  </h4>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    isCurrentDeficit ? 'bg-secondary/15 text-secondary' : 'bg-error-container text-on-error-container'
                  }`}>
                    {isCurrentDeficit ? 'Deficit Preserved' : 'Surplus Exceeded'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 my-4 text-center">
                  <div className="p-3 bg-[#f8f9ff] rounded-xl border border-outline-variant/40">
                    <span className="text-[10px] font-bold text-outline uppercase block">Maintenance Limit</span>
                    <span className="text-headline-md font-bold text-on-surface font-data-tabular">{calorieTargetInput}</span>
                    <span className="text-[10px] text-outline block">kcal</span>
                  </div>
                  <div className="p-3 bg-[#f8f9ff] rounded-xl border border-outline-variant/40">
                    <span className="text-[10px] font-bold text-outline uppercase block">Total Consumed</span>
                    <span className="text-headline-md font-bold text-primary font-data-tabular">{currentTotalNumber}</span>
                    <span className="text-[10px] text-outline block">kcal</span>
                  </div>
                  <div className={`p-3 rounded-xl border ${
                    isCurrentDeficit ? 'bg-secondary/10 border-secondary/20' : 'bg-error-container/20 border-error/30'
                  }`}>
                    <span className="text-[10px] font-bold uppercase block text-outline">Net Balance</span>
                    <span className={`text-headline-md font-bold font-data-tabular ${isCurrentDeficit ? 'text-secondary' : 'text-error'}`}>
                      {isCurrentDeficit ? `-${currentDeficit}` : `+${Math.abs(currentDeficit)}`}
                    </span>
                    <span className="text-[10px] text-outline block">kcal {isCurrentDeficit ? 'deficit' : 'surplus'}</span>
                  </div>
                </div>

                {dayNotes && (
                  <div className="p-3 bg-surface-container rounded-lg text-xs text-on-surface-variant font-medium mt-2">
                    <span className="font-bold text-on-surface mr-1">Notes:</span> {dayNotes}
                  </div>
                )}
              </div>

              {/* Logged Meals List for the Selected Date */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center pb-3 border-b border-outline-variant/40 mb-3">
                  <h4 className="text-body-md font-bold text-on-background flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-sm">lunch_dining</span>
                    Logged Meals & Snacks ({dayMeals.length})
                  </h4>
                  <span className="text-xs font-data-tabular font-bold text-outline">
                    Sum: {dayMeals.reduce((acc, m) => acc + m.calories, 0)} kcal
                  </span>
                </div>

                {dayMeals.length === 0 ? (
                  <div className="text-center py-8 text-on-surface-variant">
                    <span className="material-symbols-outlined text-outline text-3xl">restaurant_menu</span>
                    <p className="text-xs font-semibold mt-1">No individual meals itemized yet.</p>
                    <p className="text-[11px] text-outline">
                      Use the "Meal by Meal" toggle if you want to record individual meals or enter your single daily total above.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant/30 max-h-60 overflow-y-auto pr-1">
                    {dayMeals.map((m) => (
                      <div key={m.id} className="py-2.5 flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-on-surface">{m.name}</span>
                            <span className="text-[10px] text-outline font-data-tabular">{m.time}</span>
                          </div>
                          {m.notes && <p className="text-[11px] text-outline mt-0.5">{m.notes}</p>}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold font-data-tabular text-primary">
                            {m.calories} kcal
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveMeal(m.id)}
                            className="text-outline hover:text-error p-1 rounded transition-colors"
                            title="Remove meal"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 2: Smart Calorie Analysis */}
        {/* ========================================================================= */}
        {activeTab === 'analysis' && summary && (
          <div className="space-y-6 animate-fade-in">
            {/* 7-Day Calorie Trajectory Chart */}
            <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">bar_chart</span>
                    7-Day Energy Balance Trajectory
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Daily calorie consumption vs your maintenance target threshold line.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-secondary"></span>
                    <span>Deficit (≤ Target)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-error"></span>
                    <span>Surplus (&gt; Target)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 border-t-2 border-dashed border-primary"></span>
                    <span>Target ({summary.defaultTarget} kcal)</span>
                  </div>
                </div>
              </div>

              {/* Chart Bars */}
              <div className="relative pt-6 pb-2">
                {/* Horizontal reference line for Target */}
                <div
                  className="absolute w-full border-t border-dashed border-primary/50 z-10 flex justify-end pr-2 pointer-events-none"
                  style={{
                    bottom: `${Math.min(95, Math.max(5, (summary.defaultTarget / maxChartCalorie) * 100))}%`
                  }}
                >
                  <span className="text-[10px] font-bold font-data-tabular text-primary bg-white/90 px-1 rounded -mt-2.5">
                    Target: {summary.defaultTarget} kcal
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-2 sm:gap-4 h-64 items-end relative">
                  {summary.sevenDayTrends.map((t) => {
                    const barHeightPct = Math.min(100, Math.round((t.calories / maxChartCalorie) * 100));
                    const isDeficit = t.deficit >= 0;

                    return (
                      <div key={t.date} className="flex flex-col items-center h-full justify-end group">
                        {/* Tooltip on hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-[#0d1c2e] text-white text-[10px] py-1 px-2 rounded pointer-events-none z-20 font-data-tabular shadow-md">
                          {t.calories > 0 ? `${t.calories} kcal (${isDeficit ? `-${t.deficit}` : `+${Math.abs(t.deficit)}`} deficit)` : 'No entry'}
                        </div>

                        {/* Bar */}
                        <div
                          className={`w-full max-w-[42px] rounded-t-lg transition-all duration-500 relative flex items-start justify-center pt-1.5 ${
                            t.calories === 0
                              ? 'bg-surface-container h-3'
                              : isDeficit
                              ? 'bg-secondary hover:brightness-105'
                              : 'bg-error hover:brightness-105'
                          }`}
                          style={{ height: t.calories > 0 ? `${Math.max(12, barHeightPct)}%` : '12px' }}
                        >
                          {t.calories > 0 && (
                            <span className="text-[10px] font-bold text-white font-data-tabular hidden sm:block">
                              {t.calories}
                            </span>
                          )}
                        </div>

                        {/* X-axis label */}
                        <div className="mt-2 text-center">
                          <span className="text-xs font-bold text-on-surface block">{t.day}</span>
                          <span className="text-[10px] text-outline font-data-tabular block">
                            {t.date.substring(5)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4-Week Rolling Deficit Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              {/* 4-Week Historical Progression */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
                <h3 className="text-headline-md font-bold text-on-background mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">date_range</span>
                  4-Week Performance Comparison
                </h3>
                <p className="text-xs text-on-surface-variant mb-4">
                  Weekly average calories, cumulative deficit, and days logged.
                </p>

                <div className="space-y-3">
                  {summary.weeklyBreakdowns.map((wb, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border transition-all ${
                        wb.isCurrentWeek ? 'bg-secondary/5 border-secondary/30' : 'bg-[#f8f9ff] border-outline-variant/50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-on-surface">{wb.weekLabel}</span>
                          {wb.isCurrentWeek && (
                            <span className="px-2 py-0.5 bg-secondary text-white rounded text-[9px] font-bold uppercase">
                              Current Week
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-bold font-data-tabular text-primary">
                          {wb.avgCalories > 0 ? `${wb.avgCalories} kcal/day avg` : 'No logs'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t border-outline-variant/30">
                        <span className="text-outline">
                          Net Deficit: <strong className={wb.netDeficit >= 0 ? 'text-secondary font-data-tabular' : 'text-error font-data-tabular'}>
                            {wb.netDeficit >= 0 ? `+${wb.netDeficit}` : wb.netDeficit} kcal
                          </strong>
                        </span>
                        <span className="text-outline text-[11px] font-data-tabular">
                          {wb.loggedDays} of 7 days logged
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Smart Metabolic & Nutritional Observations */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">psychology</span>
                    Metabolic & Fat Loss Insights
                  </h3>
                  <p className="text-xs text-on-surface-variant mb-4">
                    Adaptive bio-guidance derived from your logged energy intake and targets.
                  </p>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-secondary/10 border border-secondary/20 rounded-xl flex items-start gap-2.5">
                      <span className="material-symbols-outlined text-secondary text-base mt-0.5">verified</span>
                      <div>
                        <span className="font-bold text-secondary">Deficit Sustainability</span>
                        <p className="text-on-surface-variant mt-0.5 leading-relaxed">
                          Your weekly average intake of {summary.weeklyAvgCalories || summary.defaultTarget} kcal represents a sustainable 
                          {summary.weeklyNetDeficit > 0 ? ` cumulative deficit of ${summary.weeklyNetDeficit} kcal` : ' maintenance baseline'}. 
                          This preserves muscle tissue while driving adipose fat oxidation.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-start gap-2.5">
                      <span className="material-symbols-outlined text-primary text-base mt-0.5">fitness_center</span>
                      <div>
                        <span className="font-bold text-primary">Gym & Workout Synergy</span>
                        <p className="text-on-surface-variant mt-0.5 leading-relaxed">
                          On resistance training days, allocate ~25-35% of daily calories post-workout to enhance glycogen replenishment and myofibrillar protein synthesis.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-surface-container border border-outline-variant/40 rounded-xl flex items-start gap-2.5">
                      <span className="material-symbols-outlined text-outline text-base mt-0.5">scale</span>
                      <div>
                        <span className="font-bold text-on-surface">30-Day Fat Loss Runway</span>
                        <p className="text-on-surface-variant mt-0.5 leading-relaxed">
                          Maintaining your current deficit will yield approximately <strong>{summary.projectedKgFatChange} kg</strong> of true fat loss per month.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-outline-variant/30 text-[11px] text-outline">
                  💡 Tip: You can adjust your default daily maintenance ceiling in <strong className="text-on-surface">Settings</strong>.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 3: Past Logs History */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <div className="bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-outline-variant bg-surface-bright flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-headline-md font-bold text-on-background">Calorie Logs History</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Chronological record of daily calorie entries, deficits, and meal counts.</p>
              </div>

              <div className="relative w-full sm:w-64">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
                <input
                  type="text"
                  placeholder="Search date or notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg pl-9 pr-3 py-1.5 text-xs text-on-surface outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="text-center py-16 text-on-surface-variant">
                <span className="material-symbols-outlined text-outline text-4xl">history_toggle_off</span>
                <p className="text-sm font-semibold mt-2">No historical calorie records found.</p>
                <p className="text-xs text-outline">Entries logged on the "Today & Logging" tab will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low text-xs text-outline border-b border-outline-variant uppercase tracking-wider font-bold">
                      <th className="p-4">Date</th>
                      <th className="p-4">Consumed (kcal)</th>
                      <th className="p-4">Target (kcal)</th>
                      <th className="p-4">Deficit / Surplus</th>
                      <th className="p-4">Itemized Meals</th>
                      <th className="p-4">Notes</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-outline-variant/30">
                    {filteredHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-[#f8f9ff] transition-colors">
                        <td className="p-4 font-bold text-on-surface font-data-tabular">
                          {item.date}
                        </td>
                        <td className="p-4 font-bold text-primary font-data-tabular">
                          {item.total_calories} kcal
                        </td>
                        <td className="p-4 text-outline font-data-tabular">
                          {item.calorie_target} kcal
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-data-tabular ${
                            item.deficit >= 0 ? 'bg-secondary/15 text-secondary' : 'bg-error-container text-on-error-container'
                          }`}>
                            {item.deficit >= 0 ? `-${item.deficit} kcal` : `+${Math.abs(item.deficit)} kcal`}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-on-surface font-data-tabular">
                          {item.meal_count > 0 ? (
                            <span className="px-2 py-0.5 bg-surface-container rounded text-outline font-semibold">
                              {item.meal_count} meals
                            </span>
                          ) : (
                            <span className="text-outline-variant">Single total</span>
                          )}
                        </td>
                        <td className="p-4 text-xs text-on-surface-variant max-w-xs truncate" title={item.notes}>
                          {item.notes || '—'}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="p-1.5 text-outline hover:text-primary hover:bg-surface-container rounded-lg transition-colors"
                              title="Edit Day Entry"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLog(item.id)}
                              className="p-1.5 text-outline hover:text-error hover:bg-error-container/20 rounded-lg transition-colors"
                              title="Delete Record"
                            >
                              <span className="material-symbols-outlined text-base">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Edit Modal Dialog */}
        {editingItem && (
          <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative animate-fade-in">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>
              <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background">Edit Calorie Intake</h3>
                  <p className="text-xs text-outline mt-0.5">{editingItem.date}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleSaveModalEdit} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Total Calories (kcal)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="15000"
                    value={editTotalInput}
                    onChange={(e) => setEditTotalInput(Number(e.target.value))}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-base font-bold font-data-tabular focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Calorie Target (kcal)
                  </label>
                  <input
                    type="number"
                    min="500"
                    max="10000"
                    value={editTargetInput}
                    onChange={(e) => setEditTargetInput(Number(e.target.value))}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm font-bold font-data-tabular focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={editNotesInput}
                    onChange={(e) => setEditNotesInput(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                  ></textarea>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-bold text-on-surface hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:opacity-95 shadow-sm"
                  >
                    Save Changes
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
