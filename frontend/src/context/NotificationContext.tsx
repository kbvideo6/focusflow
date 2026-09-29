import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

export interface NotificationItem {
  id: string;
  type: 'finance' | 'attendance' | 'gym' | 'projects';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationItem['type'];
}

interface NotificationContextType {
  notifications: NotificationItem[];
  permission: NotificationPermission;
  toast: ToastNotification | null;
  requestPermission: () => Promise<void>;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  markAsRead: (id: string) => void;
  checkAlerts: () => Promise<void>;
  dismissToast: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user, apiUrl } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  // Load notifications from localStorage on mount or when user changes
  useEffect(() => {
    if (user) {
      const stored = localStorage.getItem(`focusflow_notifications_${user.id}`);
      if (stored) {
        try {
          setNotifications(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse notifications', e);
        }
      } else {
        setNotifications([]);
      }
    } else {
      setNotifications([]);
    }
  }, [user]);

  // Persist notifications to localStorage
  const saveNotifications = (items: NotificationItem[]) => {
    if (user) {
      localStorage.setItem(`focusflow_notifications_${user.id}`, JSON.stringify(items));
    }
    setNotifications(items);
  };

  const requestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const status = await Notification.requestPermission();
      setPermission(status);

      if (status === 'granted') {
        const enabledToast: ToastNotification = {
          id: 'permission-enabled',
          title: 'Notifications enabled',
          message: 'You will now receive budget, attendance, gym, and deadline alerts.',
          type: 'finance'
        };
        setToast(enabledToast);

        try {
          new Notification('Notifications Enabled', {
            body: 'You will now receive alerts for budget, attendance, gym and project limits!',
            icon: '/screen.png'
          });
        } catch (e) {
          console.error('Failed to trigger native permission notification', e);
        }
      } else if (status === 'denied') {
        setToast({
          id: 'permission-denied',
          title: 'In-app alerts are still active',
          message: 'Browser notifications are blocked, but alerts will still appear in the notification panel.',
          type: 'attendance'
        });
      }
    }
  };

  const dismissToast = () => {
    setToast(null);
  };

  const triggerNativeNotification = (title: string, body: string, type: NotificationItem['type']) => {
    if (permission === 'granted' && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        new Notification(title, {
          body,
          icon: '/screen.png'
        });
      } catch (e) {
        console.error('Failed to trigger native notification', e);
      }
    }

    setToast({
      id: `${type}_${Date.now()}`,
      title,
      message: body,
      type
    });
  };

  const checkAlerts = async () => {
    if (!token || !user) return;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const newAlerts: Omit<NotificationItem, 'id' | 'timestamp' | 'isRead'>[] = [];

      // 1. Check Finance Summary
      const finRes = await fetch(`${apiUrl}/tracker/finance/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (finRes.ok) {
        const finData = await finRes.json();
        const { monthlyLimit, dailyLimit, monthlySpent, dailySpent } = finData;

        if (monthlyLimit && monthlySpent > monthlyLimit) {
          newAlerts.push({
            type: 'finance',
            title: 'Monthly Budget Exceeded',
            message: `You spent ${monthlySpent.toLocaleString()} LKR, exceeding your limit of ${monthlyLimit.toLocaleString()} LKR.`
          });
        } else if (monthlyLimit && monthlySpent >= monthlyLimit * 0.9) {
          newAlerts.push({
            type: 'finance',
            title: 'Monthly Budget Warning',
            message: `You spent ${monthlySpent.toLocaleString()} LKR, reaching 90% of your limit (${monthlyLimit.toLocaleString()} LKR).`
          });
        }

        if (dailyLimit && dailySpent > dailyLimit) {
          newAlerts.push({
            type: 'finance',
            title: 'Daily Budget Exceeded',
            message: `You spent ${dailySpent.toLocaleString()} LKR today, exceeding your daily limit of ${dailyLimit.toLocaleString()} LKR.`
          });
        }
      }

      // 2. Check Course Attendance
      const subRes = await fetch(`${apiUrl}/tracker/subjects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (subRes.ok) {
        const subjects = await subRes.json();
        subjects.forEach((sub: any) => {
          if (sub.attendance_target_required && sub.percentage < sub.attendance_target) {
            newAlerts.push({
              type: 'attendance',
              title: `Critical Attendance: ${sub.name}`,
              message: `Your attendance is ${sub.percentage}%, dropping below your target of ${sub.attendance_target}%.`
            });
          }
        });
      }

      // 3. Check Gym Status for Today
      const gymRes = await fetch(`${apiUrl}/tracker/gym/daily?date=${todayStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (gymRes.ok) {
        const gymData = await gymRes.json();
        // If daily gym record is unvisited AND workout/water/sleep is zero, remind user
        if (
          !gymData.visited &&
          gymData.water_intake_ml === 0 &&
          gymData.sleep_hours === 0 &&
          (!gymData.workout_summary || gymData.workout_summary.trim() === '')
        ) {
          newAlerts.push({
            type: 'gym',
            title: 'Gym & Health Tracker Reminder',
            message: "Don't forget to track your water, sleep, and workouts for today!"
          });
        }
      }

      // 4. Check Project Deadlines
      const projRes = await fetch(`${apiUrl}/tracker/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (projRes.ok) {
        const projects = await projRes.json();
        projects.forEach((proj: any) => {
          if (proj.status !== 'done' && proj.due_date === todayStr) {
            newAlerts.push({
              type: 'projects',
              title: `Project Deadline: ${proj.name}`,
              message: `This project is due today! Update its status once completed.`
            });
          }
        });
      }

      const currentNotifications = [...notifications];
      let hasChanges = false;

      newAlerts.forEach(alert => {
        const alreadyExists = currentNotifications.some(
          n => n.type === alert.type && n.title === alert.title && n.message === alert.message
        );

        if (!alreadyExists) {
          const newNotification: NotificationItem = {
            id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            ...alert,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRead: false
          };

          currentNotifications.unshift(newNotification);
          hasChanges = true;

          triggerNativeNotification(alert.title, alert.message, alert.type);
        }
      });

      if (hasChanges) {
        saveNotifications(currentNotifications);
      }
    } catch (e) {
      console.error('Error checking alerts:', e);
    }
  };

  // Run alert check when token is available or changes
  useEffect(() => {
    if (token && user) {
      // Run immediately
      checkAlerts();

      // Poll every 3 minutes for new alerts
      const interval = setInterval(checkAlerts, 3 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [token, user]);

  const clearNotification = (id: string) => {
    const updated = notifications.filter(n => n.id !== id);
    saveNotifications(updated);
  };

  const clearAll = () => {
    saveNotifications([]);
  };

  const markAsRead = (id: string) => {
    const updated = notifications.map(n =>
      n.id === id ? { ...n, isRead: true } : n
    );
    saveNotifications(updated);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        permission,
        toast,
        requestPermission,
        clearNotification,
        clearAll,
        markAsRead,
        checkAlerts,
        dismissToast
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
