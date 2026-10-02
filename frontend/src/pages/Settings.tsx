import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

export const Settings: React.FC = () => {
  const { user, updateSettings } = useAuth();
  const { pushStatus, subscribe, unsubscribe, sendTest, isSupported } = usePushNotifications();
  
  const [monthlyLimit, setMonthlyLimit] = useState(30000);
  const [dailyLimit, setDailyLimit] = useState(1000);
  const [attendanceTarget, setAttendanceTarget] = useState(80);
  const [calorieTarget, setCalorieTarget] = useState(2000);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (user) {
      setMonthlyLimit(user.monthly_budget_limit || 30000);
      setDailyLimit(user.daily_budget_limit || 1000);
      setAttendanceTarget(user.attendance_target_pct || 80);
      setCalorieTarget(user.daily_calorie_target || 2000);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await updateSettings(monthlyLimit, dailyLimit, attendanceTarget, calorieTarget);
      setSuccess('Settings updated successfully!');
      setTimeout(() => setSuccess(''), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    }
  };

  const handleTestPush = async () => {
    const ok = await sendTest();
    if (ok) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  const pushLabel: Record<string, string> = {
    idle: 'Not enabled',
    subscribed: 'Active',
    denied: 'Blocked by browser',
    unsupported: 'Not supported in this browser',
    pending: 'Enabling…',
    error: 'Error – try again'
  };

  const pushColor: Record<string, string> = {
    idle: 'text-outline',
    subscribed: 'text-secondary',
    denied: 'text-error',
    unsupported: 'text-outline',
    pending: 'text-primary',
    error: 'text-error'
  };

  return (
    <Layout title="Settings">
      <div className="space-y-6 max-w-xl mx-auto">

        {/* ── Tracking Thresholds ────────────────────────────── */}
        <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-6">
          <h3 className="text-headline-md font-headline-md font-bold text-on-background border-l-4 border-primary pl-3">
            Configurations &amp; Thresholds
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="p-3 bg-error-container text-on-error-container text-xs rounded font-medium">{error}</div>}
            {success && <div className="p-3 bg-secondary/15 text-secondary text-xs rounded font-medium">{success}</div>}

            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Currency &amp; Monthly Budget Limit</label>
              <div className="relative">
                <input
                  type="number"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(Number(e.target.value))}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-stat-value focus:ring-2 focus:ring-primary focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-data-tabular font-bold">LKR</span>
              </div>
              <p className="text-xs text-outline mt-1">General monthly ceiling (e.g. 30,000 LKR including Rent)</p>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Daily Spending Limit</label>
              <div className="relative">
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-stat-value focus:ring-2 focus:ring-primary focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-data-tabular font-bold">LKR</span>
              </div>
              <p className="text-xs text-outline mt-1">Maximum daily allowance before triggering warning banners (e.g. 1,000 LKR)</p>
            </div>

            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Course Attendance Target (%)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={attendanceTarget}
                  onChange={(e) => setAttendanceTarget(Number(e.target.value))}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-stat-value focus:ring-2 focus:ring-primary focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-data-tabular font-bold">%</span>
              </div>
              <p className="text-xs text-outline mt-1">University mandatory attendance target threshold (typically 80%)</p>
            </div>

            {user?.is_admin && (
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Daily Calorie Target (kcal)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="500"
                    max="10000"
                    step="50"
                    value={calorieTarget}
                    onChange={(e) => setCalorieTarget(Number(e.target.value))}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-stat-value focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-data-tabular font-bold">kcal</span>
                </div>
                <p className="text-xs text-outline mt-1">Daily energy limit for deficit / surplus calculations (e.g. 2,000 kcal)</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-primary text-on-primary py-3.5 rounded-lg text-label-sm font-semibold hover:bg-primary/95 transition-all shadow-sm active:scale-95 duration-100"
            >
              Update Configuration Thresholds
            </button>
          </form>
        </div>

        {/* ── Push Notification Settings ─────────────────────── */}
        <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary mt-0.5">notifications_active</span>
            <div>
              <h3 className="text-headline-md font-headline-md font-bold text-on-background">Push Notifications</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Receive smart daily reminders about attendance, budgets, and health — even when FocusFlow isn't open.
              </p>
            </div>
          </div>

          {!isSupported ? (
            <div className="p-3 bg-surface-container rounded-lg text-xs text-on-surface-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-outline text-sm">warning</span>
              Your browser does not support push notifications. Try Chrome or Edge.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between py-2 border-t border-outline-variant/30">
                <div>
                  <p className="text-xs font-semibold text-on-surface">Status</p>
                  <p className={`text-xs font-bold mt-0.5 ${pushColor[pushStatus] || 'text-outline'}`}>
                    {pushLabel[pushStatus] || pushStatus}
                  </p>
                </div>
                <div className="flex gap-2">
                  {pushStatus === 'subscribed' ? (
                    <button
                      onClick={unsubscribe}
                      className="px-3 py-1.5 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-error-container/20 hover:text-error hover:border-error transition-colors"
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      onClick={subscribe}
                      disabled={pushStatus === 'pending' || pushStatus === 'unsupported' || pushStatus === 'denied'}
                      className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pushStatus === 'pending' ? 'Enabling…' : 'Enable'}
                    </button>
                  )}

                  {pushStatus === 'subscribed' && (
                    <button
                      onClick={handleTestPush}
                      className="px-3 py-1.5 border border-outline-variant text-primary text-xs font-semibold rounded-lg hover:bg-primary/10 transition-colors"
                    >
                      {testSent ? '✓ Sent!' : 'Send Test'}
                    </button>
                  )}
                </div>
              </div>

              {pushStatus === 'denied' && (
                <div className="p-3 bg-error-container/30 rounded-lg text-xs text-on-error-container">
                  <strong>Notifications blocked.</strong> Open your browser settings → Site Settings → Notifications → Allow for this site.
                </div>
              )}

              <div className="text-xs text-outline space-y-1 pt-1">
                <p className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: '14px' }}>check_circle</span>
                  One daily reminder only — no spam
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: '14px' }}>check_circle</span>
                  Budget warnings when limits are close
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: '14px' }}>check_circle</span>
                  Attendance alerts for at-risk subjects
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: '14px' }}>check_circle</span>
                  Works even when the browser tab is closed
                </p>
              </div>
            </>
          )}
        </div>

      </div>
    </Layout>
  );
};
