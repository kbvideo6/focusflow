import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Attendance } from './pages/Attendance';
import { Finance } from './pages/Finance';
import { Gym } from './pages/Gym';
import { Skincare } from './pages/Skincare';
import { Projects } from './pages/Projects';
import { Settings } from './pages/Settings';
import { Developer } from './pages/Developer';
import { Calories } from './pages/Calories';
import { Addictions } from './pages/Addictions';
import './index.css';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="text-primary font-bold animate-pulse text-lg">Loading FocusFlow...</div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="text-primary font-bold animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="text-primary font-bold animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  if (token) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const AppContent: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Auth routes */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

        {/* Core Trackers (Accessible to all authenticated users) */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
        <Route path="/finance" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        {/* Advanced Trackers & Tools (Admin Privileged Only) */}
        <Route path="/gym" element={<AdminRoute><Gym /></AdminRoute>} />
        <Route path="/calories" element={<AdminRoute><Calories /></AdminRoute>} />
        <Route path="/skincare" element={<AdminRoute><Skincare /></AdminRoute>} />
        <Route path="/addictions" element={<AdminRoute><Addictions /></AdminRoute>} />
        <Route path="/projects" element={<AdminRoute><Projects /></AdminRoute>} />
        <Route path="/developer" element={<AdminRoute><Developer /></AdminRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </AuthProvider>
  );
};

export default App;
