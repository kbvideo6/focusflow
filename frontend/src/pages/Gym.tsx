import React, { useEffect, useState } from 'react';
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

export const Gym: React.FC = () => {
  const { token, apiUrl } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'health' | 'workout' | 'templates' | 'history'>('health');
  
  // Health states
  const [gymLogged, setGymLogged] = useState(false);
  const [waterIntake, setWaterIntake] = useState(0);
  const [sleepHours, setSleepHours] = useState(0.0);
  const [workoutSummary, setWorkoutSummary] = useState('');
  
  // Templates states
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newExercisesList, setNewExercisesList] = useState<string[]>([]);
  const [currentExerciseInput, setCurrentExerciseInput] = useState('');

  // Workout Logger states
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [workoutDate, setWorkoutDate] = useState(new Date().toISOString().split('T')[0]);
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, { reps: number; weight: number }[]>>({}); // exerciseName -> sets

  // History states
  const [logs, setLogs] = useState<WorkoutLog[]>([]);

  const dateStr = new Date().toISOString().split('T')[0];

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
    } catch (err) {
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
      if (logRes.ok) setLogs(await logRes.json());
    } catch (err) {
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
        alert('Daily health status saved successfully!');
      }
    } catch (err) {
      console.error('Gym save error:', err);
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
    if (!newTemplateName.trim() || newExercisesList.length === 0) {
      alert('Please enter a template name and at least one exercise.');
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
        fetchTemplatesAndLogs();
        setActiveTab('workout');
      }
    } catch (err) {
      console.error('Create template failed:', err);
    }
  };

  // Initialize logs sets when template changes
  const handleSelectTemplate = (id: number | '') => {
    setSelectedTemplateId(id);
    if (id === '') {
      setExerciseLogs({});
      return;
    }
    const template = templates.find(t => t.id === id);
    if (template) {
      const initialLogs: Record<string, { reps: number; weight: number }[]> = {};
      template.exercises.forEach(ex => {
        // Start with 3 sets of reps: 10, weight: 0
        initialLogs[ex.name] = [
          { reps: 10, weight: 40 },
          { reps: 10, weight: 40 },
          { reps: 10, weight: 40 }
        ];
      });
      setExerciseLogs(initialLogs);
    }
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

  // Add Set
  const handleAddSet = (exerciseName: string) => {
    setExerciseLogs(prev => {
      const currentSets = [...(prev[exerciseName] || [])];
      const lastSet = currentSets[currentSets.length - 1] || { reps: 10, weight: 40 };
      currentSets.push({ ...lastSet });
      return { ...prev, [exerciseName]: currentSets };
    });
  };

  // Delete Set
  const handleRemoveSet = (exerciseName: string, setIdx: number) => {
    setExerciseLogs(prev => {
      const currentSets = [...(prev[exerciseName] || [])];
      if (currentSets.length > 1) {
        currentSets.splice(setIdx, 1);
      }
      return { ...prev, [exerciseName]: currentSets };
    });
  };

  // Save Session Logs
  const handleSaveWorkoutSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(exerciseLogs).length === 0) return;

    try {
      for (const [exName, sets] of Object.entries(exerciseLogs)) {
        await fetch(`${apiUrl}/tracker/gym/logs`, {
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
      }
      alert('Workout logged successfully!');
      setSelectedTemplateId('');
      setExerciseLogs({});
      fetchTemplatesAndLogs();
      setActiveTab('history');
    } catch (err) {
      console.error('Log session failed:', err);
    }
  };

  return (
    <Layout title="Gym & Health">
      <div className="space-y-stack-lg">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-background mb-2">Gym & Health Tracker</h1>
            <p className="text-body-md font-body-md text-on-surface-variant">Log daily health logs, create routines, and record detailed sets/reps weight logs.</p>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant shadow-sm w-fit self-end">
            <button
              onClick={() => setActiveTab('health')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'health' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Daily Health
            </button>
            <button
              onClick={() => setActiveTab('workout')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'workout' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Log Workout
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'templates' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'history' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Logs History
            </button>
          </div>
        </div>

        {/* Tab 1: Daily Health logs */}
        {activeTab === 'health' && (
          <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm max-w-xl mx-auto">
            <h3 className="text-stat-value font-bold text-on-background border-l-4 border-primary pl-3 mb-6">Daily Health Check-in</h3>
            
            <form onSubmit={handleSaveHealth} className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-surface-container-low/40 rounded-lg border border-outline-variant/30">
                <div>
                  <p className="text-body-md font-semibold text-on-surface">Gym Visited</p>
                  <p className="text-xs text-outline">Check-in for today's workout session</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGymLogged(!gymLogged)}
                  className={`w-12 h-6 rounded-full relative transition-colors shadow-inner flex items-center ${
                    gymLogged ? 'bg-secondary' : 'bg-outline-variant'
                  }`}
                >
                  <span className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform absolute ${
                    gymLogged ? 'right-1' : 'left-1'
                  }`}></span>
                </button>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-label-sm font-bold text-on-surface-variant uppercase">Water Intake</span>
                  <span className="text-stat-value text-secondary font-data-tabular">{(waterIntake / 1000).toFixed(2)} Liters</span>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setWaterIntake(Math.max(0, waterIntake - 250))}
                    className="px-4 py-2 border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container"
                  >
                    - 250ml
                  </button>
                  <div className="flex-1 bg-surface-container-low h-10 rounded-lg relative overflow-hidden flex items-center justify-center border border-outline-variant/30">
                    <div className="bg-secondary/20 h-full absolute left-0 bottom-0" style={{ width: `${Math.min(100, (waterIntake / 3000) * 100)}%` }}></div>
                    <span className="z-10 font-bold font-data-tabular text-sm text-secondary-container text-secondary">Target: 3.0L</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWaterIntake(waterIntake + 250)}
                    className="px-4 py-2 bg-secondary text-white rounded-lg text-sm font-semibold hover:opacity-95"
                  >
                    + 250ml
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-label-sm font-bold text-on-surface-variant uppercase">Sleep Hours</span>
                  <span className="text-stat-value text-primary font-data-tabular">{sleepHours.toFixed(1)} Hours</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="16"
                  step="0.5"
                  value={sleepHours}
                  onChange={(e) => setSleepHours(Number(e.target.value))}
                  className="w-full h-2 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <label className="block text-label-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Workout / Feeling Summary Notes</label>
                <textarea
                  value={workoutSummary}
                  onChange={(e) => setWorkoutSummary(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-xl p-4 text-body-md focus:ring-2 focus:ring-primary focus:outline-none resize-none h-28"
                  placeholder="Notes on energy level, muscles trained, or personal health records..."
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-on-primary py-3.5 rounded-lg text-label-sm font-semibold hover:bg-primary/95 transition-colors shadow-sm active:scale-95 duration-100"
              >
                Save Health Check-in
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Detailed Session Logger */}
        {activeTab === 'workout' && (
          <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm max-w-2xl mx-auto space-y-6">
            <h3 className="text-stat-value font-bold text-on-background border-l-4 border-primary pl-3 mb-4">Log Gym Session</h3>

            <div>
              <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1">1. Choose Workout Template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="">-- Choose Template --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {selectedTemplateId !== '' && (
              <form onSubmit={handleSaveWorkoutSession} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1">Workout Date</label>
                  <input
                    type="date"
                    value={workoutDate}
                    onChange={(e) => setWorkoutDate(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-6 border-t border-outline-variant/30 pt-6">
                  {Object.keys(exerciseLogs).map((exName) => (
                    <div key={exName} className="p-4 bg-[#f8f9ff] rounded-xl border border-outline-variant/30 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="font-semibold text-primary">{exName}</h4>
                        <button
                          type="button"
                          onClick={() => handleAddSet(exName)}
                          className="text-xs text-secondary hover:underline flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">add</span> Add Set
                        </button>
                      </div>

                      <div className="space-y-2">
                        {exerciseLogs[exName].map((set, setIdx) => (
                          <div key={setIdx} className="flex items-center gap-3 bg-white p-2 rounded border border-outline-variant/30 text-xs">
                            <span className="font-bold text-outline w-12 font-data-tabular">Set {setIdx + 1}</span>
                            <div className="flex items-center gap-2 flex-grow">
                              <input
                                type="number"
                                value={set.weight}
                                onChange={(e) => handleSetChange(exName, setIdx, 'weight', Number(e.target.value))}
                                className="w-16 bg-[#f8f9ff] border border-outline-variant rounded p-1 text-center font-data-tabular font-bold"
                                placeholder="kg"
                                required
                              />
                              <span className="text-outline">kg</span>
                            </div>
                            <div className="flex items-center gap-2 flex-grow">
                              <input
                                type="number"
                                value={set.reps}
                                onChange={(e) => handleSetChange(exName, setIdx, 'reps', Number(e.target.value))}
                                className="w-16 bg-[#f8f9ff] border border-outline-variant rounded p-1 text-center font-data-tabular font-bold"
                                placeholder="reps"
                                required
                              />
                              <span className="text-outline">reps</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveSet(exName, setIdx)}
                              className="text-outline hover:text-error transition-colors"
                            >
                              <span className="material-symbols-outlined text-base">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="w-full bg-secondary text-white py-3.5 rounded-lg text-label-sm font-semibold hover:opacity-95 transition-all shadow-sm active:scale-95 duration-100"
                >
                  Log Workout Session
                </button>
              </form>
            )}
          </div>
        )}

        {/* Tab 3: Template Creator */}
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
                className="w-full bg-secondary text-white py-3 rounded-lg text-label-sm font-semibold hover:opacity-95 transition-all shadow-sm active:scale-95 duration-100"
              >
                Create Routine Template
              </button>
            </form>
          </div>
        )}

        {/* Tab 4: Logs History */}
        {activeTab === 'history' && (
          <div className="bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden max-w-3xl mx-auto">
            <div className="p-6 border-b border-outline-variant bg-surface-bright">
              <h3 className="text-headline-md font-headline-md text-on-background font-bold">Workout Session Logs</h3>
            </div>
            
            <div className="p-6 space-y-4">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant font-medium">No exercises logged yet.</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-4 rounded-xl bg-[#f8f9ff] border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-primary">{log.exercise_name}</h4>
                      <p className="text-xs text-outline">{new Date(log.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      {log.sets.map((set, idx) => (
                        <span key={idx} className="bg-white px-2 py-1 border border-outline-variant/30 rounded font-data-tabular">
                          S{idx + 1}: <span className="font-bold text-secondary">{set.weight}kg</span> x <span className="font-bold text-primary">{set.reps}r</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
