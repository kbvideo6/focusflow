import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface TimetableItem {
  id: number;
  day_of_week: string;
  time_slot: string;
  subject_name: string;
  location?: string;
}

interface FinanceSummary {
  monthlyLimit: number;
  dailyLimit: number;
  monthlySpent: number;
  dailySpent: number;
  categories: { category: string; amount: number }[];
  trends: { date: string; day: string; amount: number }[];
}

export const Dashboard: React.FC = () => {
  const { token, apiUrl, user } = useAuth();
  
  const [todayClasses, setTodayClasses] = useState<TimetableItem[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [loggedClasses, setLoggedClasses] = useState<Record<string, string>>({}); // subject_name -> status
  
  // Gym & Health today states
  const [gymLogged, setGymLogged] = useState(false);
  const [waterIntake, setWaterIntake] = useState(0);
  const [sleepHours, setSleepHours] = useState(0);
  const [workoutSummary, setWorkoutSummary] = useState('');

  // Skincare completion today stats
  const [skincareAM, setSkincareAM] = useState(0);
  const [skincarePM, setSkincarePM] = useState(0);

  // Pomodoro states
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [pomodoroSession, setPomodoroSession] = useState(1);
  const [pomodoroMode, setPomodoroMode] = useState<'focus' | 'break'>('focus'); // 'focus' or 'break'

  const todayIndex = new Date().getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][todayIndex];
  const dateStr = new Date().toISOString().split('T')[0];

  const fetchDashboardData = async () => {
    if (!token) return;
    try {
      // 1. Fetch timetable and filter today's classes
      const ttRes = await fetch(`${apiUrl}/tracker/timetable`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (ttRes.ok) {
        const classes: TimetableItem[] = await ttRes.json();
        const filtered = classes.filter(c => c.day_of_week === dayName);
        setTodayClasses(filtered);
      }

      // 3. Fetch finance summary
      const finRes = await fetch(`${apiUrl}/tracker/finance/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (finRes.ok) setFinance(await finRes.json());

      // 4. Fetch gym and skincare only if user is admin
      if (user?.is_admin) {
        const gymRes = await fetch(`${apiUrl}/tracker/gym/daily?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (gymRes.ok) {
          const gymData = await gymRes.json();
          setGymLogged(!!gymData.visited);
          setWaterIntake(gymData.water_intake_ml || 0);
          setSleepHours(gymData.sleep_hours || 0);
          setWorkoutSummary(gymData.workout_summary || '');
        }

        const skinRes = await fetch(`${apiUrl}/tracker/skincare/daily?date=${dateStr}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (skinRes.ok) {
          const skinData = await skinRes.json();
          setSkincareAM(skinData.morning?.completed_items?.length || 0);
          setSkincarePM(skinData.night?.completed_items?.length || 0);
        }
      }

      // 6. Fetch recent attendance logs to see what has been logged today
      const attHistoryRes = await fetch(`${apiUrl}/tracker/attendance/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (attHistoryRes.ok) {
        const history = await attHistoryRes.json();
        const todayLogs = history.filter((h: any) => h.date === dateStr);
        const mapped: Record<string, string> = {};
        todayLogs.forEach((l: any) => {
          mapped[l.subject_name] = l.status;
        });
        setLoggedClasses(mapped);
      }
    } catch (err) {
      console.error('Fetch dashboard error:', err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token]);

  // Handle class attendance quick logging
  const handleLogAttendance = async (subjectName: string, status: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/attendance/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          subject_name: subjectName,
          date: dateStr,
          status
        })
      });
      if (res.ok) {
        setLoggedClasses(prev => ({ ...prev, [subjectName]: status }));
        // Refresh dashboard statistics
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Log attendance failed:', err);
    }
  };

  // Save Gym log change
  const handleGymCheckIn = async (checked: boolean) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/gym/daily`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: dateStr,
          visited: checked ? 1 : 0,
          water_intake_ml: waterIntake,
          sleep_hours: sleepHours,
          workout_summary: workoutSummary
        })
      });
      if (res.ok) {
        setGymLogged(checked);
      }
    } catch (err) {
      console.error('Gym save error:', err);
    }
  };

  // Water increment helper
  const handleIncrementWater = async () => {
    if (!token) return;
    const nextWater = waterIntake + 250;
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
          water_intake_ml: nextWater,
          sleep_hours: sleepHours,
          workout_summary: workoutSummary
        })
      });
      if (res.ok) {
        setWaterIntake(nextWater);
      }
    } catch (err) {
      console.error('Water save error:', err);
    }
  };

  // Pomodoro effect
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setPomodoroTime(prev => {
          if (prev <= 1) {
            // Timer finished
            setIsTimerRunning(false);
            if (pomodoroMode === 'focus') {
              alert('Focus session complete! Time for a short break.');
              setPomodoroMode('break');
              return 5 * 60; // 5 minute break
            } else {
              alert('Break complete! Back to work.');
              setPomodoroMode('focus');
              setPomodoroSession(s => s + 1);
              return 25 * 60; // 25 minute focus
            }
          }
          return prev - 1;
        });
      }, 1000);
    } else if (interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, pomodoroMode]);

  const toggleTimer = () => {
    setIsTimerRunning(!isTimerRunning);
  };

  const resetTimer = () => {
    setIsTimerRunning(false);
    setPomodoroTime(pomodoroMode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const formatTimerTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Compute Pomodoro circular stroke dashoffset
  const maxTimerSeconds = pomodoroMode === 'focus' ? 25 * 60 : 5 * 60;

  // Compute LKR budget info
  const monthlySpent = finance?.monthlySpent || 0;
  const monthlyLimit = finance?.monthlyLimit || 30000;
  const budgetProgress = Math.min(100, Math.round((monthlySpent / monthlyLimit) * 100));
  const remainingBudget = Math.max(0, monthlyLimit - monthlySpent);

  // Compute Attendance safety display
  const targetRequiredCount = 80;

  return (
    <Layout title="Dashboard">
      <div className="space-y-gutter">
        {/* Top Metric Cards Panel */}
        <section className={`grid grid-cols-1 ${user?.is_admin ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-gutter`}>
          {/* Attendance Overview Card */}
          <div className="bg-white rounded-xl border border-outline-variant/50 shadow-sm p-6 hover:shadow-md transition-shadow group flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 text-primary font-medium">
                <span className="material-symbols-outlined">event_available</span>
                <span className="text-label-sm font-label-sm uppercase tracking-wider">Attendance Target</span>
              </div>
              <span className="px-2 py-1 bg-secondary-container/30 text-secondary border border-secondary/20 rounded text-label-sm font-label-sm font-bold">
                {targetRequiredCount}% target
              </span>
            </div>
            <div className="mb-2">
              <span className="text-display-lg-mobile font-display-lg-mobile text-secondary">Active</span>
            </div>
            <p className="text-body-md font-body-md text-on-surface-variant">
              Logs recorded on <span className="font-semibold text-on-surface">Present</span>, <span className="font-semibold text-on-surface">Medical</span> or <span className="font-semibold text-on-surface">Not Present</span>
            </p>
          </div>

          {/* Budget Overview Card */}
          <div className="bg-white rounded-xl border border-outline-variant/50 shadow-sm p-6 hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 text-tertiary font-medium">
                <span className="material-symbols-outlined">account_balance_wallet</span>
                <span className="text-label-sm font-label-sm uppercase tracking-wider">LKR Spending Status</span>
              </div>
              <span className="px-2 py-1 bg-surface-container text-on-surface-variant rounded text-label-sm font-label-sm font-bold">
                {new Date().toLocaleString('default', { month: 'short' }).toUpperCase()}
              </span>
            </div>
            <div className="mb-2">
              <span className="text-display-lg-mobile font-display-lg-mobile text-on-surface">
                {monthlySpent.toLocaleString()}
              </span>
              <span className="text-headline-md font-headline-md text-outline"> / {monthlyLimit.toLocaleString()} LKR</span>
            </div>
            <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden mb-2">
              <div className="h-full bg-tertiary rounded-full" style={{ width: `${budgetProgress}%` }}></div>
            </div>
            <p className="text-data-tabular font-data-tabular text-on-surface-variant text-right">
              {remainingBudget.toLocaleString()} LKR remaining
            </p>
          </div>

          {/* Quick Gym / Health Card (Admin Only) */}
          {user?.is_admin && (
            <div className="bg-white rounded-xl border border-outline-variant/50 shadow-sm p-6 hover:shadow-md transition-shadow group flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <span className="material-symbols-outlined">fitness_center</span>
                  <span className="text-label-sm font-label-sm uppercase tracking-wider">Health & Habits</span>
                </div>
              </div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-stat-value font-stat-value text-on-surface">Gym Checked In</p>
                  <p className="text-label-sm font-label-sm text-outline">{gymLogged ? 'Completed session' : 'Rest day / Pending'}</p>
                </div>
                <button
                  onClick={() => handleGymCheckIn(!gymLogged)}
                  className={`w-12 h-6 rounded-full relative transition-colors shadow-inner flex items-center ${
                    gymLogged ? 'bg-secondary' : 'bg-outline-variant'
                  }`}
                >
                  <span className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform absolute ${
                    gymLogged ? 'right-1' : 'left-1'
                  }`}></span>
                </button>
              </div>
              <div className="pt-4 border-t border-outline-variant/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleIncrementWater}
                    className="flex items-center gap-2 text-on-surface-variant hover:text-secondary group/btn"
                  >
                    <span className="material-symbols-outlined text-secondary group-hover/btn:scale-110 transition-transform" style={{ fontSize: '18px' }}>water_drop</span>
                    <span className="text-body-md font-body-md font-medium">{(waterIntake / 1000).toFixed(2)}L Water</span>
                  </button>
                  <div className="text-data-tabular font-data-tabular text-outline">Target: 3.0L</div>
                </div>
                <div className="flex items-center justify-between text-xs text-outline pt-2 border-t border-outline-variant/10">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-primary text-[14px]">face_6</span> Skincare AM</span>
                  <span className="font-bold">{skincareAM} done</span>
                </div>
                <div className="flex items-center justify-between text-xs text-outline">
                  <span className="flex items-center gap-1"><span className="material-symbols-outlined text-primary text-[14px]">dark_mode</span> Skincare PM</span>
                  <span className="font-bold">{skincarePM} done</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Dashboard Mid Row: Classes timetable & Pomodoro */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          {/* Today's Timetable Checklist */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-outline-variant/50 shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-stat-value font-stat-value text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">menu_book</span>
                Today's Timetable ({dayName})
              </h3>
            </div>
            <div className="space-y-3 flex-grow">
              {todayClasses.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant bg-surface-container-low/20 border border-dashed border-outline-variant/50 rounded-lg">
                  <span className="material-symbols-outlined text-outline mb-2" style={{ fontSize: '48px' }}>event_busy</span>
                  <p className="text-body-md font-medium">No classes scheduled for today.</p>
                  <p className="text-xs text-outline mt-1">Enjoy your study leave / break!</p>
                </div>
              ) : (
                todayClasses.map((cls) => {
                  const loggedStatus = loggedClasses[cls.subject_name];
                  
                  return (
                    <div key={cls.id} className="p-4 rounded-lg border border-outline-variant/30 bg-[#f8f9ff] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded bg-surface-container flex flex-col items-center justify-center text-primary text-center">
                          <span className="text-[10px] font-bold leading-none mt-1">TIME</span>
                          <span className="text-label-sm font-label-sm font-bold text-primary mt-1">{cls.time_slot.split('–')[0].trim()}</span>
                        </div>
                        <div>
                          <h4 className="text-body-md font-body-md font-semibold text-on-surface">{cls.subject_name}</h4>
                          <p className="text-data-tabular font-data-tabular text-on-surface-variant text-sm">
                            Slot: {cls.time_slot} {cls.location ? `• ${cls.location}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {loggedStatus ? (
                          <span className={`px-3 py-1.5 rounded text-label-sm font-label-sm font-bold flex items-center gap-1 uppercase ${
                            loggedStatus === 'present' 
                              ? 'bg-secondary/10 text-secondary' 
                              : loggedStatus === 'medical'
                              ? 'bg-[#c3c0ff]/20 text-[#5148d7]'
                              : 'bg-error-container/30 text-error'
                          }`}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                              {loggedStatus === 'present' ? 'check_circle' : loggedStatus === 'medical' ? 'medical_services' : 'cancel'}
                            </span>
                            {loggedStatus}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleLogAttendance(cls.subject_name, 'present')}
                              className="px-2.5 py-1.5 bg-secondary-container text-on-secondary-container border border-secondary-container/50 rounded text-label-sm font-medium hover:bg-secondary hover:text-white transition-colors"
                            >
                              Present
                            </button>
                            <button
                              onClick={() => handleLogAttendance(cls.subject_name, 'absent')}
                              className="px-2.5 py-1.5 border border-outline-variant text-on-surface-variant rounded text-label-sm font-medium hover:bg-error-container hover:text-error hover:border-error-container transition-colors"
                            >
                              Absent
                            </button>
                            <button
                              onClick={() => handleLogAttendance(cls.subject_name, 'medical')}
                              className="px-2.5 py-1.5 bg-surface-container text-[#2a14b4] rounded text-label-sm font-medium hover:bg-primary hover:text-white transition-colors"
                            >
                              Medical
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Pomodoro Timer widget */}
          <div className="bg-primary text-on-primary rounded-xl shadow-sm p-6 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-container to-primary opacity-50"></div>
            <div className="z-10 text-center w-full">
              <div className="flex justify-between w-full mb-4 px-2 text-primary-fixed-dim">
                <span className="material-symbols-outlined cursor-pointer hover:text-white transition-colors" onClick={resetTimer}>settings_backup_restore</span>
                <span className="text-label-sm font-label-sm tracking-widest uppercase">{pomodoroMode} session</span>
                <span className="material-symbols-outlined cursor-pointer hover:text-white transition-colors">hourglass_top</span>
              </div>
              <div className="my-6 relative inline-flex items-center justify-center">
                <svg className="w-44 h-44 transform -rotate-90">
                  <circle className="text-primary-fixed-dim/30" cx="88" cy="88" fill="none" r="80" stroke="currentColor" strokeWidth="4"></circle>
                  <circle
                    className="text-white transition-all duration-300"
                    cx="88"
                    cy="88"
                    fill="none"
                    r="80"
                    stroke="currentColor"
                    strokeDasharray="502"
                    strokeDashoffset={502 - (502 * pomodoroTime) / maxTimerSeconds}
                    strokeWidth="8"
                    strokeLinecap="round"
                  ></circle>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold font-display-lg tabular-nums tracking-tight">{formatTimerTime(pomodoroTime)}</span>
                  <span className="text-data-tabular font-data-tabular text-primary-fixed-dim mt-1">Session {pomodoroSession}/4</span>
                </div>
              </div>
              <button
                onClick={toggleTimer}
                className="w-full py-3 bg-white text-primary rounded-lg font-bold text-body-md shadow-sm hover:bg-surface-bright transition-colors active:scale-95 duration-100"
              >
                {isTimerRunning ? 'Pause Focus' : 'Start Focus'}
              </button>
            </div>
          </div>
        </section>

        {/* Dashboard Bottom Row: Finance Analytics */}
        <section className="bg-white rounded-xl border border-outline-variant/50 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-stat-value font-stat-value text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary">analytics</span>
              Weekly Expense Analytics
            </h3>
            <span className="text-label-sm font-label-sm text-outline">Showing last 7 days</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Doughnut Category stacked visual */}
            <div className="flex flex-col items-center justify-center">
              <h4 className="text-label-sm text-outline uppercase tracking-wider mb-6 font-bold">Category Distribution</h4>
              {finance && finance.categories.length > 0 ? (
                <div className="space-y-3 w-full max-w-xs">
                  {finance.categories.map((cat, idx) => {
                    const pct = Math.round((cat.amount / (finance.monthlySpent || 1)) * 100);
                    const colors = ['bg-[#2a14b4]', 'bg-[#006a61]', 'bg-[#692400]', 'bg-[#ba1a1a]', 'bg-amber-500'];
                    const color = colors[idx % colors.length];
                    
                    return (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-on-surface-variant flex items-center gap-1">
                            <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
                            {cat.category}
                          </span>
                          <span className="font-data-tabular">{cat.amount.toLocaleString()} LKR ({pct}%)</span>
                        </div>
                        <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                          <div className={`h-full ${color}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-on-surface-variant">
                  <p className="text-sm">No expenses logged this month.</p>
                </div>
              )}
            </div>

            {/* SVG line chart trend representation */}
            <div className="md:col-span-2 flex flex-col justify-between h-48 border-b border-l border-outline-variant/30 pb-4 pl-4 mt-4 md:mt-0 relative">
              <div className="h-full w-full relative">
                {finance && finance.trends.length > 0 ? (
                  <>
                    <svg className="w-full h-full stroke-tertiary fill-none" preserveAspectRatio="none" strokeWidth="2" viewBox="0 0 100 40">
                      {/* Draw simple line chart path */}
                      {(() => {
                        const maxVal = Math.max(...finance.trends.map(t => t.amount), 1000);
                        const coords = finance.trends.map((t, idx) => {
                          const x = (idx / 6) * 100;
                          const y = 40 - (t.amount / maxVal) * 35; // keep some padding at top
                          return `${x},${y}`;
                        });
                        const pathStr = `M ${coords.join(' L ')}`;
                        const fillPathStr = `${pathStr} L 100,40 L 0,40 Z`;
                        
                        return (
                          <>
                            <path d={pathStr} />
                            <path className="fill-[#ffdbcd]/20 stroke-none" d={fillPathStr} />
                          </>
                        );
                      })()}
                    </svg>

                    {/* X Axis labels */}
                    <div className="absolute bottom-[-24px] left-0 right-0 flex justify-between text-[10px] text-outline font-data-tabular">
                      {finance.trends.map(t => (
                        <span key={t.date}>{t.day}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-outline">
                    <p className="text-sm">Log some daily transactions to generate trends.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};
