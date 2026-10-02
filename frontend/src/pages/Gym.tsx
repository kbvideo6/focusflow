import React, { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface WorkoutTemplate {
  id: number;
  name: string;
  exercises: { id: number; name: string; sort_order: number }[];
}

interface WorkoutLog {
  id: number;
  date: string;
  exercise_name: string;
  sets: { reps: number; weight: number }[];
}

interface DailyHealthLog {
  id: number;
  date: string;
  visited: number;
  water_intake_ml: number;
  sleep_hours: number;
  workout_summary: string;
}

export const Gym: React.FC = () => {
  const { token, apiUrl } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'health' | 'analysis' | 'workout' | 'templates' | 'history'>('health');
  const [historySubTab, setHistorySubTab] = useState<'healthLogs' | 'workoutLogs'>('healthLogs');
  
  // Health states
  const [gymLogged, setGymLogged] = useState(false);
  const [waterIntake, setWaterIntake] = useState(0);
  const [sleepHours, setSleepHours] = useState(0.0);
  const [workoutSummary, setWorkoutSummary] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSavingHealth, setIsSavingHealth] = useState(false);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  
  // Daily Health Logs history list
  const [dailyLogs, setDailyLogs] = useState<DailyHealthLog[]>([]);
  const [searchLogQuery, setSearchLogQuery] = useState('');
  const [filterVisitedOnly, setFilterVisitedOnly] = useState<'all' | 'visited' | 'rest'>('all');

  // Templates states
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newExercisesList, setNewExercisesList] = useState<string[]>([]);
  const [currentExerciseInput, setCurrentExerciseInput] = useState('');

  // Workout Logger states
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [workoutDate, setWorkoutDate] = useState(new Date().toISOString().split('T')[0]);
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, { reps: number; weight: number }[]>>({});
  const [customExerciseInput, setCustomExerciseInput] = useState('');

  // Workout History states
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);

  const dateStr = new Date().toISOString().split('T')[0];

  const QUICK_EXERCISES = [
    'Bench Press', 'Incline Dumbbell Press', 'Barbell Squat', 'Deadlift', 
    'Pull-ups', 'Barbell Row', 'Overhead Press', 'Dumbbell Bicep Curl', 
    'Triceps Pushdown', 'Leg Press', 'Plank', 'Push-ups'
  ];

  const fetchHealthData = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/gym/daily?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const gymData = await res.json();
        setGymLogged(!!gymData.visited);
        setWaterIntake(gymData.water_intake_ml || 0);
        setSleepHours(gymData.sleep_hours || 0);
        setWorkoutSummary(gymData.workout_summary || '');
      }

      // Fetch all daily health logs
      const allRes = await fetch(`${apiUrl}/tracker/gym/daily/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (allRes.ok) {
        const allLogs = await allRes.json();
        setDailyLogs(allLogs);
      }
    } catch (err: any) {
      console.error('Fetch health log error:', err);
    }
  };

  const fetchTemplatesAndLogs = async () => {
    if (!token) return;
    try {
      const tempRes = await fetch(`${apiUrl}/tracker/gym/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (tempRes.ok) setTemplates(await tempRes.json());

      const logRes = await fetch(`${apiUrl}/tracker/gym/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (logRes.ok) setWorkoutLogs(await logRes.json());
    } catch (err: any) {
      console.error('Fetch gym logs error:', err);
    }
  };

  useEffect(() => {
    fetchHealthData();
    fetchTemplatesAndLogs();
  }, [token]);

  // Save Health Status
  const handleSaveHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSavingHealth(true);
    try {
      const res = await fetch(`${apiUrl}/tracker/gym/daily`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: dateStr,
          visited: gymLogged ? 1 : 0,
          water_intake_ml: waterIntake,
          sleep_hours: sleepHours,
          workout_summary: workoutSummary
        })
      });
      if (res.ok) {
        setSaveSuccessMsg('Daily health check-in logged successfully!');
        setTimeout(() => setSaveSuccessMsg(''), 3500);
        fetchHealthData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Failed to save health check-in.');
      }
    } catch (err: any) {
      console.error('Gym save error:', err);
      setErrorMsg(err.message || 'Connection error saving health check-in.');
    } finally {
      setIsSavingHealth(false);
    }
  };

  // Delete Daily Health Log
  const handleDeleteDailyLog = async (id: number) => {
    if (!window.confirm('Delete this daily health log entry?')) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/gym/daily/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchHealthData();
      }
    } catch (err) {
      console.error('Delete daily health log error:', err);
    }
  };

  // Delete Workout Log
  const handleDeleteWorkoutLog = async (id: number) => {
    if (!window.confirm('Delete this workout exercise entry?')) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/gym/logs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTemplatesAndLogs();
      }
    } catch (err) {
      console.error('Delete workout log error:', err);
    }
  };

  // Add Exercise to new template state
  const handleAddExerciseToNewTemplate = () => {
    if (currentExerciseInput.trim()) {
      setNewExercisesList([...newExercisesList, currentExerciseInput.trim()]);
      setCurrentExerciseInput('');
    }
  };

  // Save Template
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newTemplateName.trim() || newExercisesList.length === 0) {
      setErrorMsg('Please enter a template name and at least one exercise.');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/tracker/gym/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          exercises: newExercisesList
        })
      });
      if (res.ok) {
        setNewTemplateName('');
        setNewExercisesList([]);
        setSaveSuccessMsg('Template created successfully!');
        setTimeout(() => setSaveSuccessMsg(''), 3000);
        await fetchTemplatesAndLogs();
        setActiveTab('workout');
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Failed to create template.');
      }
    } catch (err: any) {
      console.error('Create template failed:', err);
      setErrorMsg(err.message || 'Connection error creating template.');
    }
  };

  // 1-Click Starter Templates Loader
  const handleLoadStarterTemplates = async () => {
    setErrorMsg('');
    const starters = [
      { name: 'Push Day (Chest, Shoulders, Triceps)', exercises: ['Bench Press', 'Incline Dumbbell Press', 'Overhead Shoulder Press', 'Triceps Rope Pushdown'] },
      { name: 'Pull Day (Back, Biceps)', exercises: ['Lat Pulldown', 'Barbell Row', 'Face Pulls', 'Bicep Barbell Curl'] },
      { name: 'Leg Day (Quads, Hamstrings, Core)', exercises: ['Barbell Squats', 'Romanian Deadlift', 'Leg Press', 'Hanging Leg Raises'] },
      { name: 'Full Body Conditioning', exercises: ['Deadlift', 'Push-ups', 'Pull-ups', 'Dumbbell Lunges'] }
    ];

    try {
      for (const starter of starters) {
        await fetch(`${apiUrl}/tracker/gym/templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(starter)
        });
      }
      setSaveSuccessMsg('Starter workout templates installed successfully!');
      setTimeout(() => setSaveSuccessMsg(''), 4000);
      await fetchTemplatesAndLogs();
    } catch (err: any) {
      console.error('Load starters error:', err);
      setErrorMsg('Failed to load starter templates.');
    }
  };

  // Initialize logs sets when template changes
  const handleSelectTemplate = (id: number | '') => {
    setSelectedTemplateId(id);
    if (id === '') return;
    const template = templates.find(t => t.id === id);
    if (template) {
      const updatedLogs: Record<string, { reps: number; weight: number }[]> = { ...exerciseLogs };
      template.exercises.forEach(ex => {
        if (!updatedLogs[ex.name]) {
          updatedLogs[ex.name] = [
            { reps: 10, weight: 20 },
            { reps: 10, weight: 20 },
            { reps: 10, weight: 20 }
          ];
        }
      });
      setExerciseLogs(updatedLogs);
    }
  };

  // Add custom exercise to current workout session
  const handleAddCustomExercise = (nameToAdd?: string) => {
    const name = (nameToAdd || customExerciseInput).trim();
    if (!name) return;
    setExerciseLogs(prev => {
      if (prev[name]) return prev;
      return {
        ...prev,
        [name]: [
          { reps: 10, weight: 20 },
          { reps: 10, weight: 20 },
          { reps: 10, weight: 20 }
        ]
      };
    });
    if (!nameToAdd) setCustomExerciseInput('');
  };

  // Remove entire exercise from current session
  const handleRemoveExercise = (exerciseName: string) => {
    setExerciseLogs(prev => {
      const copy = { ...prev };
      delete copy[exerciseName];
      return copy;
    });
  };

  // Log set parameter update
  const handleSetChange = (exerciseName: string, setIdx: number, key: 'reps' | 'weight', val: number) => {
    setExerciseLogs(prev => {
      const currentSets = [...(prev[exerciseName] || [])];
      currentSets[setIdx] = {
        ...currentSets[setIdx],
        [key]: val
      };
      return { ...prev, [exerciseName]: currentSets };
    });
  };

  // Add Set to exercise
  const handleAddSet = (exerciseName: string) => {
    setExerciseLogs(prev => {
      const currentSets = [...(prev[exerciseName] || [])];
      const lastSet = currentSets[currentSets.length - 1] || { reps: 10, weight: 20 };
      currentSets.push({ ...lastSet });
      return { ...prev, [exerciseName]: currentSets };
    });
  };

  // Delete Set from exercise
  const handleRemoveSet = (exerciseName: string, setIdx: number) => {
    setExerciseLogs(prev => {
      const currentSets = [...(prev[exerciseName] || [])];
      if (currentSets.length > 1) {
        currentSets.splice(setIdx, 1);
        return { ...prev, [exerciseName]: currentSets };
      } else {
        const copy = { ...prev };
        delete copy[exerciseName];
        return copy;
      }
    });
  };

  // Save Session Logs
  const handleSaveWorkoutSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const exercisesToSave = Object.entries(exerciseLogs).filter(([_, sets]) => sets.length > 0);
    if (exercisesToSave.length === 0) {
      setErrorMsg('Please add at least one exercise with sets to log your workout.');
      return;
    }

    setIsSavingWorkout(true);
    try {
      for (const [exName, sets] of exercisesToSave) {
        const res = await fetch(`${apiUrl}/tracker/gym/logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            date: workoutDate,
            exercise_name: exName,
            sets
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to log sets for ${exName}`);
        }
      }
      setSaveSuccessMsg('Workout session logged successfully!');
      setTimeout(() => setSaveSuccessMsg(''), 4000);
      setSelectedTemplateId('');
      setExerciseLogs({});
      await fetchHealthData();
      await fetchTemplatesAndLogs();
      setActiveTab('history');
      setHistorySubTab('workoutLogs');
    } catch (err: any) {
      console.error('Log session failed:', err);
      setErrorMsg(err.message || 'Failed to log workout session.');
    } finally {
      setIsSavingWorkout(false);
    }
  };

  // Filtered Daily Health Logs
  const filteredDailyLogs = useMemo(() => {
    return dailyLogs.filter(log => {
      const matchesSearch = !searchLogQuery || 
        (log.workout_summary && log.workout_summary.toLowerCase().includes(searchLogQuery.toLowerCase())) ||
        log.date.includes(searchLogQuery);
      
      const matchesVisited = filterVisitedOnly === 'all' 
        ? true 
        : filterVisitedOnly === 'visited' 
          ? !!log.visited 
          : !log.visited;

      return matchesSearch && matchesVisited;
    });
  }, [dailyLogs, searchLogQuery, filterVisitedOnly]);

  // SMART ANALYSIS CALCULATIONS
  const analysisStats = useMemo(() => {
    const totalDaysLogged = dailyLogs.length;
    const visitedDays = dailyLogs.filter(l => !!l.visited).length;
    const visitRate = totalDaysLogged > 0 ? Math.round((visitedDays / totalDaysLogged) * 100) : 0;

    // Calculate current streak
    let streak = 0;
    const sorted = [...dailyLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const log of sorted) {
      if (log.visited) streak++;
      else break;
    }

    // Averages
    const totalWater = dailyLogs.reduce((acc, l) => acc + (l.water_intake_ml || 0), 0);
    const avgWater = totalDaysLogged > 0 ? Math.round(totalWater / totalDaysLogged) : 0;

    const totalSleep = dailyLogs.reduce((acc, l) => acc + (l.sleep_hours || 0), 0);
    const avgSleep = totalDaysLogged > 0 ? (totalSleep / totalDaysLogged).toFixed(1) : '0.0';

    // Hydration goal met days (>= 2750ml)
    const hydrationGoalsMet = dailyLogs.filter(l => (l.water_intake_ml || 0) >= 2750).length;

    // Workout logs volume & PRs
    let totalVolumeLifted = 0;
    let totalSetsLogged = 0;
    const exercisePRs: Record<string, number> = {};
    const exerciseFrequency: Record<string, number> = {};

    workoutLogs.forEach(w => {
      exerciseFrequency[w.exercise_name] = (exerciseFrequency[w.exercise_name] || 0) + 1;
      if (Array.isArray(w.sets)) {
        w.sets.forEach(s => {
          totalSetsLogged++;
          const weight = s.weight || 0;
          const reps = s.reps || 0;
          totalVolumeLifted += weight * reps;
          if (!exercisePRs[w.exercise_name] || weight > exercisePRs[w.exercise_name]) {
            exercisePRs[w.exercise_name] = weight;
          }
        });
      }
    });

    const topExercises = Object.entries(exerciseFrequency)
      .map(([name, count]) => ({ name, count, pr: exercisePRs[name] || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // AI Insight determination
    const insights: string[] = [];
    if (visitRate >= 70) {
      insights.push(`🔥 Impressive gym consistency! You've checked in for ${visitedDays} of ${totalDaysLogged} logged days (${visitRate}%).`);
    } else if (totalDaysLogged > 0) {
      insights.push(`💪 Aim for 3-4 sessions a week. You currently have ${visitedDays} gym sessions logged.`);
    }

    if (Number(avgSleep) < 7.0 && totalDaysLogged > 0) {
      insights.push(`⚠️ Sleep average is ${avgSleep} hrs. Muscle recovery and hypertrophy are significantly enhanced with 7.5+ hours of sleep.`);
    } else if (Number(avgSleep) >= 7.0) {
      insights.push(`💤 Excellent sleep hygiene! You are averaging ${avgSleep} hrs of sleep, fueling optimal workout recovery.`);
    }

    if (avgWater >= 2500) {
      insights.push(`💧 Great hydration! Reaching ~${(avgWater / 1000).toFixed(1)}L daily maintains peak strength and reduces soreness.`);
    } else if (totalDaysLogged > 0) {
      insights.push(`🚰 Drink more water: Your daily average is ${(avgWater / 1000).toFixed(1)}L. Target at least 2.5L to 3.0L on training days.`);
    }

    return {
      totalDaysLogged,
      visitedDays,
      visitRate,
      streak,
      avgWater,
      avgSleep,
      hydrationGoalsMet,
      totalVolumeLifted,
      totalSetsLogged,
      topExercises,
      insights
    };
  }, [dailyLogs, workoutLogs]);

  return (
    <Layout title="Gym & Health">
      <div className="space-y-stack-lg">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-background mb-2">Gym & Health Tracker</h1>
            <p className="text-body-md font-body-md text-on-surface-variant">Log daily health check-ins, view past logs, analyze physical recovery, and record workout sets.</p>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant shadow-sm w-fit self-end flex-wrap gap-1">
            <button
              onClick={() => setActiveTab('health')}
              className={`px-4 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'health' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Daily Health
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-4 py-2 rounded-full text-label-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'analysis' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">insights</span>
              Smart Analysis
            </button>
            <button
              onClick={() => setActiveTab('workout')}
              className={`px-4 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'workout' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Log Workout
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'templates' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'history' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Logs History
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Tab 1: Daily Health Check-in & Immediate Check-in Logs List */}
        {/* ========================================================================= */}
        {activeTab === 'health' && (
          <div className="space-y-stack-md">
            <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-stat-value font-bold text-on-background border-l-4 border-primary pl-3">Daily Health Check-in</h3>
                <span className="text-xs font-data-tabular font-bold text-outline bg-surface-container px-3 py-1 rounded-full">
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              
              {saveSuccessMsg && (
                <div className="mb-4 p-3 bg-secondary/15 border border-secondary/30 text-secondary text-xs rounded-lg flex items-center gap-2 font-medium animate-fadeIn">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {saveSuccessMsg}
                </div>
              )}

              {errorMsg && (
                <div className="mb-4 p-3 bg-error-container/20 border border-error/30 text-error text-xs rounded-lg flex items-center justify-between font-medium animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">error</span>
                    <span>{errorMsg}</span>
                  </div>
                  <button type="button" onClick={() => setErrorMsg('')} className="text-outline hover:text-on-surface">
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveHealth} className="space-y-6">
                {/* Gym Visited Check-in Switch */}
                <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-body-md font-bold text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>fitness_center</span>
                        Gym Visited Today
                      </p>
                      <p className="text-xs text-outline mt-0.5">Toggle on to register your workout attendance in your history logs</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGymLogged(!gymLogged)}
                      className={`w-14 h-7 rounded-full relative transition-colors shadow-inner flex items-center px-1 ${
                        gymLogged ? 'bg-secondary' : 'bg-outline-variant'
                      }`}
                    >
                      <span className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform transform ${
                        gymLogged ? 'translate-x-7' : 'translate-x-0'
                      }`}></span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant font-medium">Want to log specific exercise sets, weights & reps?</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('workout')}
                      className="text-primary hover:underline font-bold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">fitness_center</span>
                      Log Workout Sets →
                    </button>
                  </div>
                </div>

                {/* Water Intake */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-secondary text-sm">water_drop</span>
                      Water Intake
                    </span>
                    <span className="text-stat-value text-secondary font-data-tabular font-bold">{(waterIntake / 1000).toFixed(2)} Liters</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setWaterIntake(Math.max(0, waterIntake - 250))}
                      className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                    >
                      - 250ml
                    </button>
                    <div className="flex-1 bg-surface-container-low h-10 rounded-lg relative overflow-hidden flex items-center justify-center border border-outline-variant/30">
                      <div className="bg-secondary/25 h-full absolute left-0 bottom-0 transition-all duration-300" style={{ width: `${Math.min(100, (waterIntake / 3000) * 100)}%` }}></div>
                      <span className="z-10 font-bold font-data-tabular text-xs text-on-surface">Target: 3.0 Liters</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWaterIntake(waterIntake + 250)}
                      className="px-4 py-2 bg-secondary text-white rounded-lg text-sm font-semibold hover:opacity-95 transition-opacity"
                    >
                      + 250ml
                    </button>
                  </div>
                </div>

                {/* Sleep Hours */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-sm">bedtime</span>
                      Sleep Hours
                    </span>
                    <span className="text-stat-value text-primary font-data-tabular font-bold">{sleepHours.toFixed(1)} Hours</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="16"
                    step="0.5"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(Number(e.target.value))}
                    className="w-full h-2.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[11px] text-outline mt-1 font-data-tabular">
                    <span>0h</span>
                    <span>6h (Min)</span>
                    <span>8h (Ideal)</span>
                    <span>16h</span>
                  </div>
                </div>

                {/* Workout / Health Summary Notes */}
                <div>
                  <label className="block text-label-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Workout / Health Feeling Summary</label>
                  <textarea
                    value={workoutSummary}
                    onChange={(e) => setWorkoutSummary(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-xl p-4 text-body-md focus:ring-2 focus:ring-primary focus:outline-none resize-none h-28"
                    placeholder="Log muscle groups worked (e.g. Chest & Triceps), physical energy, pump quality, or soreness..."
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSavingHealth}
                  className="w-full bg-primary text-on-primary py-3.5 rounded-lg text-label-sm font-semibold hover:bg-primary/95 transition-all shadow-sm active:scale-98 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-sm">{isSavingHealth ? 'sync' : 'save'}</span>
                  {isSavingHealth ? 'Saving Check-in...' : 'Save Health Check-in'}
                </button>
              </form>
            </div>

            {/* Daily Health Login / Check-in List on the page */}
            <div className="bg-white border border-outline-variant rounded-xl shadow-sm p-6 max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6 pb-4 border-b border-outline-variant/40">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">format_list_bulleted</span>
                    Daily Health & Check-in Logs List
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">Timeline of all recorded gym visits, hydration, sleep, and session notes</p>
                </div>

                {/* Quick stats badges */}
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-secondary/15 text-secondary border border-secondary/20 rounded-full text-xs font-bold font-data-tabular">
                    {dailyLogs.filter(l => !!l.visited).length} Visited Days
                  </span>
                  <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold font-data-tabular">
                    {dailyLogs.length} Total Logs
                  </span>
                </div>
              </div>

              {dailyLogs.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant bg-surface-bright rounded-xl border border-outline-variant/30">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: '36px' }}>fitness_center</span>
                  <p className="text-sm font-semibold mt-2">No daily health logs recorded yet.</p>
                  <p className="text-xs text-outline mt-0.5">Use the check-in form above to log your first health entry!</p>
                </div>
              ) : (
                <div className="divide-y divide-outline-variant/40">
                  {dailyLogs.slice(0, 7).map((log) => (
                    <div key={log.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-surface-bright/60 px-3 rounded-lg transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-on-background font-data-tabular">
                            {new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {log.visited ? (
                            <span className="px-2.5 py-0.5 bg-secondary text-white rounded-full text-[11px] font-bold flex items-center gap-1 shadow-xs">
                              <span className="material-symbols-outlined text-xs">check</span>
                              Gym Checked In
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-surface-container text-outline rounded-full text-[11px] font-semibold flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">hotel</span>
                              Rest Day
                            </span>
                          )}
                        </div>
                        {log.workout_summary ? (
                          <p className="text-xs text-on-surface bg-surface-container-low/50 p-2 rounded border border-outline-variant/20 italic">
                            "{log.workout_summary}"
                          </p>
                        ) : (
                          <p className="text-xs text-outline italic">No summary notes provided</p>
                        )}
                      </div>

                      <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
                        <div className="text-right">
                          <div className="text-xs font-bold text-secondary font-data-tabular">
                            💧 {(log.water_intake_ml / 1000).toFixed(2)}L
                          </div>
                          <div className="text-xs font-bold text-primary font-data-tabular">
                            💤 {log.sleep_hours} hrs
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteDailyLog(log.id)}
                          className="p-1.5 text-outline hover:text-error hover:bg-error-container/20 rounded transition-colors"
                          title="Delete health log"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 2: Smart Gym & Health Analysis */}
        {/* ========================================================================= */}
        {activeTab === 'analysis' && (
          <div className="space-y-stack-md max-w-5xl mx-auto">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {/* Gym Attendance Rate */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-secondary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Gym Visit Rate</span>
                    <span className="material-symbols-outlined">fitness_center</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {analysisStats.visitRate}%
                  </div>
                </div>
                <div className="mt-3 text-xs text-on-surface-variant font-medium">
                  {analysisStats.visitedDays} attended of {analysisStats.totalDaysLogged} recorded days
                </div>
              </div>

              {/* Gym Streak */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-tertiary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Active Streak</span>
                    <span className="material-symbols-outlined">local_fire_department</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular flex items-center gap-2">
                    {analysisStats.streak} <span className="text-sm font-semibold text-outline">Days</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-on-surface-variant font-medium">
                  {analysisStats.streak > 0 ? 'Consecutive workouts logged 🔥' : 'Start your streak today!'}
                </div>
              </div>

              {/* Avg Sleep Recovery */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-primary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Average Sleep</span>
                    <span className="material-symbols-outlined">bedtime</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {analysisStats.avgSleep} <span className="text-sm font-semibold text-outline">hrs/day</span>
                  </div>
                </div>
                <div className="mt-3 text-xs font-medium">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    Number(analysisStats.avgSleep) >= 7.5 ? 'bg-secondary/15 text-secondary' : 'bg-error-container text-on-error-container'
                  }`}>
                    {Number(analysisStats.avgSleep) >= 7.5 ? 'Optimal Recovery' : 'Needs Sleep Recovery'}
                  </span>
                </div>
              </div>

              {/* Average Hydration */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-secondary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Avg Hydration</span>
                    <span className="material-symbols-outlined">water_drop</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {(analysisStats.avgWater / 1000).toFixed(2)} <span className="text-sm font-semibold text-outline">L/day</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-on-surface-variant font-medium">
                  Target: 3.00 Liters ({Math.min(100, Math.round((analysisStats.avgWater / 3000) * 100))}% met)
                </div>
              </div>
            </div>

            {/* Smart Insights Card */}
            <div className="bg-gradient-to-r from-primary-container/10 via-surface-container-low to-secondary-container/10 border border-primary/20 rounded-xl p-6 shadow-sm">
              <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary">psychology</span>
                Smart Health & Gym Insights
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {analysisStats.insights.map((insight, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-outline-variant/30 shadow-xs text-xs text-on-surface font-medium leading-relaxed">
                    {insight}
                  </div>
                ))}
              </div>
            </div>

            {/* Workout Volume & PRs breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              {/* Exercise Personal Records */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
                <h3 className="text-headline-md font-bold text-on-background border-l-4 border-secondary pl-3 mb-4">Top Exercises & Personal Records</h3>
                {analysisStats.topExercises.length === 0 ? (
                  <p className="text-xs text-outline py-6 text-center">No workout exercise sets logged yet to calculate PRs.</p>
                ) : (
                  <div className="space-y-3">
                    {analysisStats.topExercises.map((item, idx) => (
                      <div key={idx} className="p-3 bg-[#f8f9ff] border border-outline-variant/30 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-primary">{item.name}</p>
                          <p className="text-xs text-outline font-medium">{item.count} sessions completed</p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-secondary font-data-tabular">{item.pr} kg</span>
                          <span className="text-[10px] text-outline block uppercase font-bold">Max Weight PR</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Training Volume Summary */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background border-l-4 border-primary pl-3 mb-4">Total Training Volume</h3>
                  <div className="p-5 bg-surface-container-low rounded-xl border border-outline-variant/30 text-center space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-outline">Accumulated Weight Lifted</p>
                    <p className="text-display-lg font-bold text-primary font-data-tabular">
                      {analysisStats.totalVolumeLifted.toLocaleString()} <span className="text-headline-md text-outline">kg</span>
                    </p>
                    <p className="text-xs text-on-surface-variant font-medium">Across {analysisStats.totalSetsLogged} sets completed</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-outline-variant/30 flex justify-between text-xs text-outline font-data-tabular">
                  <span>Hydration Goals Achieved: <strong className="text-on-surface">{analysisStats.hydrationGoalsMet} days</strong></span>
                  <span>Avg Volume / Set: <strong className="text-on-surface">
                    {analysisStats.totalSetsLogged > 0 ? Math.round(analysisStats.totalVolumeLifted / analysisStats.totalSetsLogged) : 0} kg
                  </strong></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 3: Detailed Session Logger */}
        {/* ========================================================================= */}
        {activeTab === 'workout' && (
          <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm max-w-2xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-outline-variant/30 pb-4">
              <div>
                <h3 className="text-stat-value font-bold text-on-background border-l-4 border-primary pl-3">Log Workout Session</h3>
                <p className="text-xs text-on-surface-variant mt-1">Pick a template or add custom exercises with weights & reps</p>
              </div>
              <div>
                <input
                  type="date"
                  value={workoutDate}
                  onChange={(e) => setWorkoutDate(e.target.value)}
                  className="bg-[#f8f9ff] border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-bold text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            {saveSuccessMsg && (
              <div className="p-3 bg-secondary/15 border border-secondary/30 text-secondary text-xs rounded-lg flex items-center gap-2 font-medium animate-fadeIn">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {saveSuccessMsg}
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-error-container/20 border border-error/30 text-error text-xs rounded-lg flex items-center justify-between font-medium animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">error</span>
                  <span>{errorMsg}</span>
                </div>
                <button type="button" onClick={() => setErrorMsg('')} className="text-outline hover:text-on-surface">
                  <span className="material-symbols-outlined text-xs">close</span>
                </button>
              </div>
            )}

            {/* Template Selector & Starter Routines */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-outline uppercase tracking-wider">Choose Routine Template (Optional)</label>
              <div className="flex gap-2">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value === '' ? '' : Number(e.target.value))}
                  className="flex-grow bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="">-- Custom / No Template --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.exercises?.length || 0} exercises)</option>
                  ))}
                </select>

                {templates.length === 0 && (
                  <button
                    type="button"
                    onClick={handleLoadStarterTemplates}
                    className="px-3 py-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Load Starters
                  </button>
                )}
              </div>
            </div>

            {/* Quick Add Custom Exercise Bar */}
            <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/40 space-y-3">
              <label className="block text-xs font-bold text-outline uppercase tracking-wider">Add Exercise to This Session</label>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customExerciseInput}
                  onChange={(e) => setCustomExerciseInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomExercise();
                    }
                  }}
                  placeholder="e.g. Incline Dumbbell Press, Bench Press, Squats..."
                  className="flex-grow bg-white border border-outline-variant rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAddCustomExercise()}
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-bold hover:bg-primary/95 flex items-center gap-1 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Add Exercise
                </button>
              </div>

              {/* Quick suggestion chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-outline font-semibold">Quick picks:</span>
                {QUICK_EXERCISES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => handleAddCustomExercise(ex)}
                    className="px-2 py-0.5 bg-white hover:bg-primary hover:text-white border border-outline-variant/40 rounded-full text-[11px] text-on-surface-variant font-medium transition-colors"
                  >
                    + {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* Exercise Sets Form */}
            <form onSubmit={handleSaveWorkoutSession} className="space-y-6">
              {Object.keys(exerciseLogs).length === 0 ? (
                <div className="text-center py-10 px-4 bg-[#f8f9ff] border-2 border-dashed border-outline-variant/50 rounded-xl space-y-3">
                  <span className="material-symbols-outlined text-4xl text-outline">fitness_center</span>
                  <div>
                    <h4 className="text-sm font-bold text-on-surface">No Exercises Added Yet</h4>
                    <p className="text-xs text-outline mt-1">Select a template above or click any quick pick exercise chip to begin logging your workout!</p>
                  </div>
                  {templates.length === 0 && (
                    <button
                      type="button"
                      onClick={handleLoadStarterTemplates}
                      className="px-4 py-2 bg-secondary text-white text-xs font-bold rounded-lg shadow-sm hover:opacity-90 inline-flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">bolt</span>
                      Install 4 Starter Workout Routines
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs font-bold text-outline">
                    <span>EXERCISES IN THIS SESSION ({Object.keys(exerciseLogs).length})</span>
                    <button
                      type="button"
                      onClick={() => setExerciseLogs({})}
                      className="text-error hover:underline font-semibold"
                    >
                      Clear All
                    </button>
                  </div>

                  {Object.keys(exerciseLogs).map((exName) => (
                    <div key={exName} className="p-4 bg-[#f8f9ff] rounded-xl border border-outline-variant/30 space-y-3">
                      <div className="flex justify-between items-center border-b border-outline-variant/20 pb-2">
                        <h4 className="font-bold text-sm text-primary flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-base">exercise</span>
                          {exName}
                        </h4>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleAddSet(exName)}
                            className="text-xs text-secondary hover:underline flex items-center gap-1 font-bold"
                          >
                            <span className="material-symbols-outlined text-sm">add_circle</span> Add Set
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveExercise(exName)}
                            className="text-outline hover:text-error transition-colors p-1"
                            title="Remove this exercise"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {exerciseLogs[exName].map((set, setIdx) => (
                          <div key={setIdx} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-outline-variant/30 text-xs">
                            <span className="font-bold text-outline w-12 font-data-tabular">Set {setIdx + 1}</span>
                            <div className="flex items-center gap-2 flex-grow">
                              <label className="text-[11px] text-outline">Weight:</label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={set.weight}
                                onChange={(e) => handleSetChange(exName, setIdx, 'weight', Number(e.target.value))}
                                className="w-20 bg-[#f8f9ff] border border-outline-variant rounded p-1 text-center font-data-tabular font-bold text-xs"
                                placeholder="kg"
                                required
                              />
                              <span className="text-outline text-xs">kg</span>
                            </div>
                            <div className="flex items-center gap-2 flex-grow">
                              <label className="text-[11px] text-outline">Reps:</label>
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={set.reps}
                                onChange={(e) => handleSetChange(exName, setIdx, 'reps', Number(e.target.value))}
                                className="w-16 bg-[#f8f9ff] border border-outline-variant rounded p-1 text-center font-data-tabular font-bold text-xs"
                                placeholder="reps"
                                required
                              />
                              <span className="text-outline text-xs">reps</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveSet(exName, setIdx)}
                              className="text-outline hover:text-error transition-colors p-1"
                              title="Delete set"
                            >
                              <span className="material-symbols-outlined text-base">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    type="submit"
                    disabled={isSavingWorkout}
                    className="w-full bg-secondary text-white py-3.5 rounded-lg text-label-sm font-semibold hover:opacity-95 transition-all shadow-sm active:scale-98 duration-100 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-sm">{isSavingWorkout ? 'sync' : 'fitness_center'}</span>
                    {isSavingWorkout ? 'Saving Workout Session...' : 'Log Workout Session'}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 4: Template Creator */}
        {/* ========================================================================= */}
        {activeTab === 'templates' && (
          <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm max-w-xl mx-auto space-y-6">
            <h3 className="text-stat-value font-bold text-on-background border-l-4 border-primary pl-3 mb-4">Create Workout Template</h3>
            
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1">Template Name (e.g. Chest Day)</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="e.g. Pull Day"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1">Add Exercise</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentExerciseInput}
                    onChange={(e) => setCurrentExerciseInput(e.target.value)}
                    className="flex-grow bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder="e.g. Bench Press"
                  />
                  <button
                    type="button"
                    onClick={handleAddExerciseToNewTemplate}
                    className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:opacity-90"
                  >
                    Add
                  </button>
                </div>
              </div>

              {newExercisesList.length > 0 && (
                <div className="p-4 bg-surface-container rounded-xl border border-outline-variant/40 space-y-2">
                  <span className="text-[10px] font-bold text-outline uppercase">Exercises in template:</span>
                  <ul className="space-y-1 text-sm font-medium">
                    {newExercisesList.map((ex, idx) => (
                      <li key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-outline-variant/30 text-xs">
                        <span>{idx + 1}. {ex}</span>
                        <button
                          type="button"
                          onClick={() => setNewExercisesList(newExercisesList.filter((_, i) => i !== idx))}
                          className="text-outline hover:text-error"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-secondary text-white py-3 rounded-lg text-label-sm font-semibold hover:opacity-95 transition-all shadow-sm active:scale-98 duration-100"
              >
                Create Routine Template
              </button>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 5: Logs History (Dual View: Daily Health Check-ins & Workout Session Logs) */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <div className="bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden max-w-4xl mx-auto">
            {/* Sub-tab navigation */}
            <div className="p-6 border-b border-outline-variant bg-surface-bright flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h3 className="text-headline-md font-headline-md text-on-background font-bold">Gym & Health Logs History</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Toggle between Daily Health Check-ins and Exercise Set/Rep Logs</p>
              </div>

              <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant/40 w-fit">
                <button
                  type="button"
                  onClick={() => setHistorySubTab('healthLogs')}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    historySubTab === 'healthLogs' ? 'bg-white shadow-xs text-primary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Daily Health Logs ({dailyLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistorySubTab('workoutLogs')}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    historySubTab === 'workoutLogs' ? 'bg-white shadow-xs text-primary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Workout Sessions ({workoutLogs.length})
                </button>
              </div>
            </div>

            {/* SubTab 1: Daily Health Check-ins List */}
            {historySubTab === 'healthLogs' && (
              <div className="p-6 space-y-4">
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pb-4 border-b border-outline-variant/30">
                  <div className="relative w-full sm:w-64">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
                    <input
                      type="text"
                      value={searchLogQuery}
                      onChange={(e) => setSearchLogQuery(e.target.value)}
                      placeholder="Search notes or dates..."
                      className="w-full pl-9 pr-3 py-2 bg-[#f8f9ff] border border-outline-variant rounded-lg text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    {(['all', 'visited', 'rest'] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFilterVisitedOnly(f)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-all border ${
                          filterVisitedOnly === f 
                            ? 'bg-primary text-on-primary border-primary' 
                            : 'bg-surface-bright text-on-surface-variant border-outline-variant'
                        }`}
                      >
                        {f === 'visited' ? 'Gym Visited' : f === 'rest' ? 'Rest Days' : 'All Logs'}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredDailyLogs.length === 0 ? (
                  <div className="text-center py-10 text-on-surface-variant font-medium">No matching daily health logs found.</div>
                ) : (
                  <div className="space-y-3">
                    {filteredDailyLogs.map((log) => (
                      <div key={log.id} className="p-4 rounded-xl bg-[#f8f9ff] border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-primary/40 transition-colors">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-sm text-on-background font-data-tabular">
                              {new Date(log.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {log.visited ? (
                              <span className="px-2.5 py-0.5 bg-secondary text-white rounded-full text-[11px] font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">check</span>
                                Gym Checked In
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 bg-surface-container text-outline rounded-full text-[11px] font-semibold flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">hotel</span>
                                Rest Day
                              </span>
                            )}
                          </div>
                          {log.workout_summary ? (
                            <p className="text-xs text-on-surface font-medium leading-relaxed bg-white/70 p-2.5 rounded-lg border border-outline-variant/20">
                              "{log.workout_summary}"
                            </p>
                          ) : (
                            <p className="text-xs text-outline italic">No summary notes logged</p>
                          )}
                        </div>

                        <div className="flex items-center gap-6 self-end md:self-center">
                          <div className="text-right">
                            <div className="text-xs font-bold text-secondary font-data-tabular">
                              💧 {(log.water_intake_ml / 1000).toFixed(2)} Liters
                            </div>
                            <div className="text-xs font-bold text-primary font-data-tabular">
                              💤 {log.sleep_hours} Hours Sleep
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteDailyLog(log.id)}
                            className="p-1.5 text-outline hover:text-error hover:bg-error-container/20 rounded transition-colors"
                            title="Delete log"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SubTab 2: Workout Exercise Sessions List */}
            {historySubTab === 'workoutLogs' && (
              <div className="p-6 space-y-4">
                {workoutLogs.length === 0 ? (
                  <div className="text-center py-10 text-on-surface-variant font-medium">No workout exercises logged yet.</div>
                ) : (
                  <div className="space-y-3">
                    {workoutLogs.map((log) => (
                      <div key={log.id} className="p-4 rounded-xl bg-[#f8f9ff] border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-primary/40 transition-colors">
                        <div>
                          <h4 className="font-semibold text-primary">{log.exercise_name}</h4>
                          <p className="text-xs text-outline">{new Date(log.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex flex-wrap gap-2 text-xs">
                            {Array.isArray(log.sets) && log.sets.map((set, idx) => (
                              <span key={idx} className="bg-white px-2.5 py-1 border border-outline-variant/30 rounded font-data-tabular shadow-xs">
                                S{idx + 1}: <span className="font-bold text-secondary">{set.weight}kg</span> x <span className="font-bold text-primary">{set.reps}r</span>
                              </span>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteWorkoutLog(log.id)}
                            className="p-1.5 text-outline hover:text-error hover:bg-error-container/20 rounded transition-colors"
                            title="Delete workout entry"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};
