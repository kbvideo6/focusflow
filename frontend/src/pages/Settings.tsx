import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

export const Settings: React.FC = () => {
  const { user, updateSettings } = useAuth();
  
  const [monthlyLimit, setMonthlyLimit] = useState(30000);
  const [dailyLimit, setDailyLimit] = useState(1000);
  const [attendanceTarget, setAttendanceTarget] = useState(80);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (user) {
      setMonthlyLimit(user.monthly_budget_limit || 30000);
      setDailyLimit(user.daily_budget_limit || 1000);
      setAttendanceTarget(user.attendance_target_pct || 80);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await updateSettings(monthlyLimit, dailyLimit, attendanceTarget);
      setSuccess('Settings updated successfully!');
      setTimeout(() => setSuccess(''), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    }
  };

  return (
    <Layout title="Settings">
      <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm max-w-xl mx-auto space-y-6">
        <h3 className="text-headline-md font-headline-md font-bold text-on-background border-l-4 border-primary pl-3">Configurations & Thresholds</h3>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="p-3 bg-error-container text-on-error-container text-xs rounded font-medium">{error}</div>}
          {success && <div className="p-3 bg-secondary/15 text-secondary text-xs rounded font-medium">{success}</div>}

          <div>
            <label className="block text-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Currency & Monthly Budget Limit</label>
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

          <button
            type="submit"
            className="w-full bg-primary text-on-primary py-3.5 rounded-lg text-label-sm font-semibold hover:bg-primary/95 transition-all shadow-sm active:scale-95 duration-100"
          >
            Update Configuration Thresholds
          </button>
        </form>
      </div>
    </Layout>
  );
};
