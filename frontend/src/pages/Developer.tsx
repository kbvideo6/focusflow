import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';

interface DatabaseOverview {
  database: {
    path: string;
    size_bytes: number;
    size_formatted: string;
  };
  counts: {
    users: number;
    subjects: number;
    attendance_logs: number;
    transactions: number;
    total_spent: number;
    gym_logs: number;
    workout_logs: number;
    skincare_logs: number;
    projects: number;
    courses: number;
    timetable_slots: number;
  };
  server: {
    uptime_seconds: number;
    node_version: string;
    timestamp: string;
  };
}

interface UserSummary {
  id: number;
  username: string;
  created_at: string;
  is_admin: boolean;
  limits: {
    monthly_budget: number;
    daily_budget: number;
    attendance_target: number;
  };
  stats: {
    subjects_count: number;
    attendance_logs_count: number;
    attendance_rate: number | null;
    transactions_count: number;
    total_spent: number;
    gym_logs_count: number;
    skincare_logs_count: number;
    projects_count: number;
    courses_count: number;
    last_activity_date: string;
  };
}

interface ActivityEvent {
  type: 'attendance' | 'finance' | 'gym' | 'skincare' | 'project';
  date: string;
  record_id: number;
  username: string;
  user_id: number;
  description: string;
}

interface UserDetailActivity {
  user: { id: number; username: string; created_at: string; is_admin: number };
  activity: {
    subjects: Array<{ id: number; name: string; attendance_target: number; priority: string }>;
    attendance_logs: Array<{ id: number; subject_name: string; date: string; status: string; notes?: string }>;
    transactions: Array<{ id: number; amount: number; category: string; description?: string; date: string }>;
    gym_logs: Array<{ id: number; date: string; visited: number; workout_summary?: string }>;
    skincare_logs: Array<{ id: number; date: string; routine_type: string; skin_rating: number; notes?: string }>;
    projects: Array<{ id: number; name: string; status: string; priority: string }>;
    courses: Array<{ id: number; name: string; platform: string; progress_pct: number }>;
  };
}

export const Developer: React.FC = () => {
  const { token, apiUrl, user: currentUser } = useAuth();
  const [overview, setOverview] = useState<DatabaseOverview | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'stream' | 'dbguide'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [togglingAdmin, setTogglingAdmin] = useState<number | null>(null);
  const [inspectingUserId, setInspectingUserId] = useState<number | null>(null);

  const fetchDeveloperData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const headers = { Authorization: `Bearer ${token}` };

      const [resOverview, resUsers, resActivity] = await Promise.all([
        fetch(`${apiUrl}/developer/overview`, { headers }),
        fetch(`${apiUrl}/developer/users`, { headers }),
        fetch(`${apiUrl}/developer/recent-activity`, { headers })
      ]);

      if (!resOverview.ok || !resUsers.ok) {
        throw new Error('Access denied. Administrator privileges required.');
      }

      const overviewData = await resOverview.json();
      const usersData = await resUsers.json();
      const activityData = resActivity.ok ? await resActivity.json() : [];

      setOverview(overviewData);
      setUsers(usersData);
      setRecentActivity(activityData);
    } catch (err: any) {
      setError(err.message || 'Failed to load developer data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDeveloperData();
    }
  }, [token]);

  const handleInspectUser = async (userId: number) => {
    try {
      setInspectingUserId(userId);
      const res = await fetch(`${apiUrl}/developer/users/${userId}/activity`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedUserDetail(data);
      }
    } catch (e) {
      console.error('Failed to load user details:', e);
    } finally {
      setInspectingUserId(null);
    }
  };

  const handleToggleAdmin = async (userId: number) => {
    try {
      setTogglingAdmin(userId);
      const res = await fetch(`${apiUrl}/developer/users/${userId}/toggle-admin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: data.is_admin } : u));
      }
    } catch (e) {
      console.error('Toggle admin failed:', e);
    } finally {
      setTogglingAdmin(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(u.id).includes(searchQuery)
  );

  const filteredActivity = recentActivity.filter(act => {
    if (activityFilter === 'all') return true;
    return act.type === activityFilter;
  });

  return (
    <Layout title="Developer Console">
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Top Header Card */}
        <div className="bg-white border border-outline-variant/60 rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-tertiary"></div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-primary text-2xl">admin_panel_settings</span>
              <h1 className="text-headline-md font-bold text-on-surface">Developer Console & Database Monitor</h1>
              <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Admin Mode
              </span>
            </div>
            <p className="text-body-md text-on-surface-variant">
              Direct visibility into registered users, system activity, and SQLite database health.
            </p>
          </div>

          <button
            onClick={fetchDeveloperData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#f0f4ff] hover:bg-primary/10 text-primary font-semibold text-sm rounded-lg transition-all active:scale-95 border border-primary/20"
          >
            <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>sync</span>
            Refresh Data
          </button>
        </div>

        {error && (
          <div className="p-4 bg-error-container text-on-error-container rounded-xl flex items-center gap-3">
            <span className="material-symbols-outlined">error</span>
            <span className="font-medium text-sm">{error}</span>
          </div>
        )}

        {/* Global KPI Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-outline-variant/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-label-sm font-semibold uppercase tracking-wider">Users</span>
              <span className="material-symbols-outlined text-primary text-lg">group</span>
            </div>
            <div className="text-2xl font-bold font-data-tabular text-on-surface">
              {overview?.counts.users ?? '--'}
            </div>
            <p className="text-[11px] text-outline mt-0.5">Registered accounts</p>
          </div>

          <div className="bg-white border border-outline-variant/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-label-sm font-semibold uppercase tracking-wider">Attendance</span>
              <span className="material-symbols-outlined text-primary text-lg">event_available</span>
            </div>
            <div className="text-2xl font-bold font-data-tabular text-on-surface">
              {overview?.counts.attendance_logs ?? '--'}
            </div>
            <p className="text-[11px] text-outline mt-0.5">{overview?.counts.subjects ?? 0} subjects tracked</p>
          </div>

          <div className="bg-white border border-outline-variant/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-label-sm font-semibold uppercase tracking-wider">Total Spent</span>
              <span className="material-symbols-outlined text-primary text-lg">payments</span>
            </div>
            <div className="text-xl font-bold font-data-tabular text-on-surface">
              LKR {(overview?.counts.total_spent ?? 0).toLocaleString()}
            </div>
            <p className="text-[11px] text-outline mt-0.5">{overview?.counts.transactions ?? 0} transactions</p>
          </div>

          <div className="bg-white border border-outline-variant/50 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-label-sm font-semibold uppercase tracking-wider">Gym & Health</span>
              <span className="material-symbols-outlined text-tertiary text-lg">fitness_center</span>
            </div>
            <div className="text-2xl font-bold font-data-tabular text-on-surface">
              {overview?.counts.gym_logs ?? '--'}
            </div>
            <p className="text-[11px] text-outline mt-0.5">{overview?.counts.skincare_logs ?? 0} skincare logs</p>
          </div>

          <div className="bg-white border border-outline-variant/50 rounded-xl p-4 shadow-sm col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-label-sm font-semibold uppercase tracking-wider">DB File Size</span>
              <span className="material-symbols-outlined text-secondary text-lg">database</span>
            </div>
            <div className="text-xl font-bold font-data-tabular text-on-surface">
              {overview?.database.size_formatted ?? '--'}
            </div>
            <p className="text-[11px] text-outline mt-0.5 truncate" title={overview?.database.path}>
              SQLite active
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-outline-variant/40 gap-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-4 font-bold text-sm transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'users'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-lg">group</span>
            All Users ({users.length})
          </button>

          <button
            onClick={() => setActiveTab('stream')}
            className={`pb-3 px-4 font-bold text-sm transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'stream'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-lg">monitoring</span>
            Live Activity Feed ({recentActivity.length})
          </button>

          <button
            onClick={() => setActiveTab('dbguide')}
            className={`pb-3 px-4 font-bold text-sm transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'dbguide'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-lg">terminal</span>
            VPS Database & CLI Access
          </button>
        </div>

        {/* TAB 1: ALL USERS LIST */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
                <input
                  type="text"
                  placeholder="Filter users by username or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <p className="text-xs text-outline font-data-tabular self-center">
                Showing {filteredUsers.length} of {users.length} registered accounts
              </p>
            </div>

            <div className="bg-white border border-outline-variant/50 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#f8f9ff] border-b border-outline-variant/50 text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Joined Date</th>
                      <th className="py-3 px-4">Subjects</th>
                      <th className="py-3 px-4">Attendance</th>
                      <th className="py-3 px-4">Spent (LKR)</th>
                      <th className="py-3 px-4">Gym Check-ins</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-on-surface-variant">
                          No users found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-surface-container-lowest/50 transition-colors">
                          <td className="py-3 px-4 font-data-tabular font-bold text-outline">#{u.id}</td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-on-surface">{u.username}</span>
                            {currentUser?.id === u.id && (
                              <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">You</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {u.is_admin ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                <span className="material-symbols-outlined text-[13px]">shield</span> Admin
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                                User
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs font-data-tabular text-on-surface-variant">
                            {u.created_at?.split(' ')[0] || u.created_at}
                          </td>
                          <td className="py-3 px-4 font-data-tabular font-semibold">
                            {u.stats.subjects_count}
                          </td>
                          <td className="py-3 px-4">
                            {u.stats.attendance_rate !== null ? (
                              <span className={`inline-block font-data-tabular text-xs font-bold px-2 py-0.5 rounded-full ${
                                u.stats.attendance_rate >= 80 
                                  ? 'bg-green-100 text-green-700' 
                                  : u.stats.attendance_rate >= 70 
                                  ? 'bg-amber-100 text-amber-700' 
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {u.stats.attendance_rate}% ({u.stats.attendance_logs_count})
                              </span>
                            ) : (
                              <span className="text-outline text-xs">No logs</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-data-tabular font-semibold text-on-surface">
                            {u.stats.total_spent > 0 ? u.stats.total_spent.toLocaleString() : '0'}
                          </td>
                          <td className="py-3 px-4 font-data-tabular">
                            {u.stats.gym_logs_count} days
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleInspectUser(u.id)}
                                disabled={inspectingUserId === u.id}
                                className="px-2.5 py-1 text-xs font-semibold bg-[#f0f4ff] hover:bg-primary/20 text-primary rounded-lg transition-colors"
                              >
                                {inspectingUserId === u.id ? 'Loading...' : 'View Activity'}
                              </button>
                              <button
                                onClick={() => handleToggleAdmin(u.id)}
                                disabled={togglingAdmin === u.id || currentUser?.id === u.id}
                                className={`px-2 py-1 text-xs font-medium rounded-lg border transition-colors ${
                                  u.is_admin
                                    ? 'border-outline-variant hover:bg-error-container hover:text-on-error-container text-outline'
                                    : 'border-purple-200 text-purple-700 hover:bg-purple-50'
                                }`}
                                title={currentUser?.id === u.id ? "You cannot revoke your own admin rights" : "Toggle Admin"}
                              >
                                {togglingAdmin === u.id ? '...' : u.is_admin ? 'Demote' : 'Make Admin'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE ACTIVITY STREAM */}
        {activeTab === 'stream' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-on-surface-variant mr-1">Filter by module:</span>
              {['all', 'attendance', 'finance', 'gym', 'skincare', 'project'].map((mod) => (
                <button
                  key={mod}
                  onClick={() => setActivityFilter(mod)}
                  className={`px-3 py-1 rounded-full text-xs font-bold capitalize transition-all ${
                    activityFilter === mod
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-white border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {mod}
                </button>
              ))}
            </div>

            <div className="bg-white border border-outline-variant/50 rounded-2xl shadow-sm divide-y divide-outline-variant/30">
              {filteredActivity.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant">
                  No activity found for this category.
                </div>
              ) : (
                filteredActivity.map((act, idx) => (
                  <div key={idx} className="p-4 flex items-start gap-3 hover:bg-[#fcfdff] transition-colors">
                    <div className="mt-1">
                      {act.type === 'attendance' && (
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">event_available</span>
                        </div>
                      )}
                      {act.type === 'finance' && (
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">payments</span>
                        </div>
                      )}
                      {act.type === 'gym' && (
                        <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">fitness_center</span>
                        </div>
                      )}
                      {act.type === 'skincare' && (
                        <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">face_6</span>
                        </div>
                      )}
                      {act.type === 'project' && (
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">account_tree</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-on-surface text-sm">{act.username}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                          {act.type}
                        </span>
                        <span className="text-xs text-outline font-data-tabular ml-auto">
                          {act.date}
                        </span>
                      </div>
                      <p className="text-sm text-on-surface-variant mt-0.5 break-words">
                        {act.description}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: VPS DATABASE & CLI GUIDE */}
        {activeTab === 'dbguide' && (
          <div className="space-y-6">
            <div className="bg-white border border-outline-variant/60 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-primary font-bold">
                <span className="material-symbols-outlined">terminal</span>
                <h2 className="text-lg">Accessing SQLite Database on Your VPS</h2>
              </div>
              <p className="text-sm text-on-surface-variant">
                The FocusFlow database is stored as a standard SQLite 3 file in the persistent Docker volume <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs font-mono font-bold">focusflow_db</code> mapped to <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs font-mono font-bold">/app/data/database.sqlite</code> inside the container.
              </p>

              <div className="space-y-4 pt-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-outline mb-1.5">
                    1. Instant Interactive Activity Report in Terminal
                  </h3>
                  <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-xs overflow-x-auto shadow-inner">
                    <code>docker exec -it focusflow-backend npm run db:activity</code>
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    Runs the built-in activity reporter and prints tables of all users, activity counts, and recent 20 actions.
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-outline mb-1.5">
                    2. Direct SQLite Shell on the VPS
                  </h3>
                  <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-xs overflow-x-auto shadow-inner space-y-1">
                    <p className="text-slate-400"># Open interactive SQLite prompt inside the container:</p>
                    <code>docker exec -it focusflow-backend sqlite3 /app/data/database.sqlite</code>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-outline mb-1.5">
                    3. Handy SQL Queries for Developers
                  </h3>
                  <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-xs overflow-x-auto shadow-inner space-y-2">
                    <div>
                      <span className="text-emerald-400">-- View all users and admin roles:</span>
                      <p>SELECT id, username, is_admin, created_at FROM users;</p>
                    </div>
                    <div>
                      <span className="text-emerald-400">-- View recent attendance records:</span>
                      <p>SELECT u.username, s.name, al.date, al.status FROM attendance_logs al JOIN subjects s ON al.subject_id = s.id JOIN users u ON s.user_id = u.id ORDER BY al.date DESC LIMIT 20;</p>
                    </div>
                    <div>
                      <span className="text-emerald-400">-- View financial transactions:</span>
                      <p>SELECT u.username, t.date, t.amount, t.category, t.description FROM transactions t JOIN users u ON t.user_id = u.id ORDER BY t.date DESC LIMIT 20;</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-outline mb-1.5">
                    4. Backup or Download Database to Your Local PC
                  </h3>
                  <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-xs overflow-x-auto shadow-inner">
                    <code>docker cp focusflow-backend:/app/data/database.sqlite ./focusflow_backup_$(date +%F).sqlite</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Activity Inspection Modal */}
        {selectedUserDetail && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-outline-variant/60 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant/50 flex justify-between items-center bg-[#f8f9ff]">
                <div>
                  <h3 className="font-bold text-on-surface text-base flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">account_circle</span>
                    User Activity: <span className="text-primary">{selectedUserDetail.user.username}</span>
                  </h3>
                  <p className="text-xs text-outline font-data-tabular">User ID #{selectedUserDetail.user.id} • Registered {selectedUserDetail.user.created_at}</p>
                </div>
                <button
                  onClick={() => setSelectedUserDetail(null)}
                  className="p-1 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                {/* Subjects */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-outline mb-2">Tracked Subjects ({selectedUserDetail.activity.subjects.length})</h4>
                  {selectedUserDetail.activity.subjects.length === 0 ? (
                    <p className="text-xs text-outline italic">No subjects registered yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedUserDetail.activity.subjects.map(s => (
                        <div key={s.id} className="bg-surface-container px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface flex items-center gap-1.5">
                          <span>{s.name}</span>
                          <span className="text-[10px] text-outline font-data-tabular">({s.attendance_target || 80}%)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Attendance */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-outline mb-2">Recent Attendance ({selectedUserDetail.activity.attendance_logs.length})</h4>
                  {selectedUserDetail.activity.attendance_logs.length === 0 ? (
                    <p className="text-xs text-outline italic">No attendance records found.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border border-outline-variant/40 rounded-xl divide-y divide-outline-variant/30 text-xs">
                      {selectedUserDetail.activity.attendance_logs.slice(0, 15).map(a => (
                        <div key={a.id} className="p-2.5 flex justify-between items-center">
                          <div>
                            <span className="font-semibold">{a.subject_name}</span>
                            {a.notes && <span className="text-outline ml-1.5 italic">({a.notes})</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                              a.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>{a.status}</span>
                            <span className="text-outline font-data-tabular">{a.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Transactions */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-outline mb-2">Recent Finance Transactions ({selectedUserDetail.activity.transactions.length})</h4>
                  {selectedUserDetail.activity.transactions.length === 0 ? (
                    <p className="text-xs text-outline italic">No finance transactions found.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border border-outline-variant/40 rounded-xl divide-y divide-outline-variant/30 text-xs">
                      {selectedUserDetail.activity.transactions.slice(0, 10).map(t => (
                        <div key={t.id} className="p-2.5 flex justify-between items-center">
                          <div>
                            <span className="font-semibold capitalize">{t.category}</span>
                            {t.description && <span className="text-outline ml-1.5">• {t.description}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-on-surface font-data-tabular">LKR {t.amount.toLocaleString()}</span>
                            <span className="text-outline font-data-tabular">{t.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-3 border-t border-outline-variant/50 bg-[#f8f9ff] flex justify-end">
                <button
                  onClick={() => setSelectedUserDetail(null)}
                  className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:bg-primary/95 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default Developer;
