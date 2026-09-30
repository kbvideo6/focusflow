import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { login, signup, updateSettings } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  
  // Setup fields for first-time signup configuration
  const [showSetup, setShowSetup] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState(30000);
  const [dailyLimit, setDailyLimit] = useState(1000);
  const [attendanceTarget, setAttendanceTarget] = useState(80);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      if (isLogin) {
        await login(cleanUsername, password);
      } else {
        await signup(cleanUsername, password);
        setShowSetup(true); // Show configuration options for new users
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await updateSettings(monthlyLimit, dailyLimit, attendanceTarget);
      // Reload or state will transition
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    }
  };

  if (showSetup) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center px-margin-mobile">
        <div className="w-full max-w-md bg-white border border-outline-variant/50 rounded-xl shadow-lg p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>
          
          <h2 className="text-headline-md font-headline-md font-bold text-primary mb-2">First-Time Setup</h2>
          <p className="text-body-md text-on-surface-variant mb-6">Configure your tracking thresholds. These can be adjusted anytime in Settings.</p>
          
          {error && <div className="p-3 bg-error-container text-on-error-container text-sm rounded mb-4 font-medium">{error}</div>}

          <form onSubmit={handleSetupSubmit} className="space-y-4">
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
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-on-primary py-3.5 rounded-lg text-label-sm font-semibold hover:bg-primary/95 transition-all shadow-sm active:scale-95 duration-100"
            >
              Save & Start Tracking
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <img src="/screen.png" alt="FocusFlow Logo" className="inline-flex w-12 h-12 object-contain mb-4 font-bold" />
        <h2 className="text-display-lg-mobile md:text-headline-md font-bold text-primary tracking-tight">FocusFlow</h2>
        <p className="text-label-sm font-label-sm text-outline mt-1 uppercase tracking-widest">Informed Focus Dashboard</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-margin-mobile">
        <div className="bg-white py-8 px-8 border border-outline-variant/50 rounded-xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>
          
          <div className="flex bg-surface-container rounded-lg p-1 mb-6 border border-outline-variant/30">
            <button
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-2 text-center text-label-sm font-bold rounded transition-all duration-200 ${
                isLogin ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-2 text-center text-label-sm font-bold rounded transition-all duration-200 ${
                !isLogin ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && <div className="p-3 bg-error-container text-on-error-container text-sm rounded mb-4 font-medium">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-body-md focus:ring-2 focus:ring-primary focus:outline-none"
                placeholder="Enter username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>

            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 pr-10 text-body-md focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary focus:outline-none transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-on-primary py-3 rounded-lg text-label-sm font-semibold hover:bg-primary/95 transition-all shadow-sm active:scale-95 duration-100"
            >
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
