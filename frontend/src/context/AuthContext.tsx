import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: number;
  username: string;
  monthly_budget_limit: number;
  daily_budget_limit: number;
  attendance_target_pct: number;
  daily_calorie_target?: number;
  is_admin?: boolean;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateSettings: (monthly: number, daily: number, attendance: number, dailyCalorie?: number) => Promise<void>;
  apiUrl: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || '/api';

  const fetchProfile = async (authToken: string) => {
    try {
      const res = await fetch(`${apiUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        // Token might be invalid
        logout();
      }
    } catch (err) {
      console.error('Fetch profile failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchProfile(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (username: string, password: string) => {
    const cleanUsername = username.trim();
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUsername, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const signup = async (username: string, password: string) => {
    const cleanUsername = username.trim();
    const res = await fetch(`${apiUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUsername, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Signup failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const updateSettings = async (monthly: number, daily: number, attendance: number, dailyCalorie?: number) => {
    if (!token) return;
    const calorieVal = dailyCalorie !== undefined ? dailyCalorie : (user?.daily_calorie_target || 2000);
    const res = await fetch(`${apiUrl}/auth/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        monthly_budget_limit: monthly,
        daily_budget_limit: daily,
        attendance_target_pct: attendance,
        daily_calorie_target: calorieVal
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Update settings failed');
    }

    setUser(prev => prev ? {
      ...prev,
      monthly_budget_limit: monthly,
      daily_budget_limit: daily,
      attendance_target_pct: attendance,
      daily_calorie_target: calorieVal
    } : null);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, signup, logout, updateSettings, apiUrl }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
