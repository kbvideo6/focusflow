import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

export interface NotificationItem {
  id: string;
  type: 'finance' | 'attendance' | 'gym' | 'projects' | 'health' | 'system';
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
  showPermissionBanner: boolean;
  requestPermission: () => Promise<void>;
  dismissPermissionBanner: () => void;
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
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  // Use a ref so checkAlerts can read the latest notifications without being in its deps
  const notificationsRef = useRef<NotificationItem[]>(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // ── Load persisted notifications ─────────────────────────────
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

  // ── Show permission banner after login (once per session) ────
  useEffect(() => {
    if (!token || !user) {
      setShowPermissionBanner(false);
      return;
    }
    if (
      'Notification' in window &&
      Notification.permission === 'default' &&
      !sessionStorage.getItem('ff_push_banner_dismissed')
    ) {
      const timer = setTimeout(() => setShowPermissionBanner(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [token, user]);

  // ── Persist notifications ────────────────────────────────────
  const saveNotifications = useCallback(
    (items: NotificationItem[]) => {
      if (user) {
        localStorage.setItem(`focusflow_notifications_${user.id}`, JSON.stringify(items));
      }
      setNotifications(items);
    },
    [user]
  );

  // ── Request browser notification permission ──────────────────
  const requestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const status = await Notification.requestPermission();
      setPermission(status);
      setShowPermissionBanner(false);
      sessionStorage.setItem('ff_push_banner_dismissed', '1');

      if (status === 'granted') {
        setToast({
          id: 'permission-enabled',
          title: 'Notifications enabled',
          message: 'You will now receive budget, attendance, and health alerts.',
          type: 'system'
        });
      } else if (status === 'denied') {
        setToast({
          id: 'permission-denied',
          title: 'In-app alerts are still active',
          message: 'Browser notifications blocked – alerts still appear in the panel.',
          type: 'attendance'
        });
      }
    }
  };

  const dismissPermissionBanner = () => {
    setShowPermissionBanner(false);
    sessionStorage.setItem('ff_push_banner_dismissed', '1');
  };

  const dismissToast = useCallback(() => setToast(null), []);

  // ── Fire native notification ──────────────────────────────────
  const permissionRef = useRef(permission);
  useEffect(() => { permissionRef.current = permission; }, [permission]);

  const triggerNativeNotification = useCallback(
    (title: string, body: string, type: NotificationItem['type']) => {
      if (permissionRef.current === 'granted' && typeof window !== 'undefined' && 'Notification' in window) {
        try {
          new Notification(title, { body, icon: '/screen.png' });
        } catch (e) {
          console.error('Failed to trigger native notification', e);
        }
      }
      setToast({ id: `${type}_${Date.now()}`, title, message: body, type });
    },
    [] // stable — uses refs internally
  );

  // ── Smart alert checker (stable reference — uses refs for notifications) ──
  const checkAlerts = useCallback(async () => {
    if (!token || !user) return;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const newAlerts: Omit<NotificationItem, 'id' | 'timestamp' | 'isRead'>[] = [];

      // 1. Finance summary
      const finRes = await fetch(`${apiUrl}/tracker/finance/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (finRes.ok) {
        const { monthlyLimit, dailyLimit, monthlySpent, dailySpent } = await finRes.json();

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
            message: `You've used 90%+ of your monthly budget (${monthlySpent.toLocaleString()} / ${monthlyLimit.toLocaleString()} LKR).`
          });
        }

        if (dailyLimit && dailySpent > dailyLimit) {
          newAlerts.push({
            type: 'finance',
            title: 'Daily Budget Exceeded',
            message: `You spent ${dailySpent.toLocaleString()} LKR today, over your daily limit of ${dailyLimit.toLocaleString()} LKR.`
          });
        }
      }

      // 2. Attendance
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
              message: `Your attendance is ${sub.percentage}%, below your target of ${sub.attendance_target}%.`
            });
          }
        });
      }

      // 3. Gym reminder (admin only)
      if (user.is_admin) {
        const gymRes = await fetch(`${apiUrl}/tracker/gym/daily?date=${todayStr}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (gymRes.ok) {
          const gymData = await gymRes.json();
          if (
            !gymData.visited &&
            gymData.water_intake_ml === 0 &&
            gymData.sleep_hours === 0 &&
            (!gymData.workout_summary || gymData.workout_summary.trim() === '')
          ) {
            newAlerts.push({
              type: 'health',
              title: 'Health Tracker Reminder',
              message: "Don't forget to log your water, sleep, and workout for today!"
            });
          }
        }
      }

      // 4. Project deadlines (admin only)
      if (user.is_admin) {
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
                message: 'This project is due today! Update its status once completed.'
              });
            }
          });
        }
      }

      // Read current notifications via ref (avoids putting notifications in deps)
      const current = [...notificationsRef.current];
      let hasChanges = false;

      newAlerts.forEach((alert) => {
        const alreadyExists = current.some(
          (n) => n.type === alert.type && n.title === alert.title
        );

        if (!alreadyExists) {
          const newNotification: NotificationItem = {
            id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            ...alert,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRead: false
          };
          current.unshift(newNotification);
          hasChanges = true;
          triggerNativeNotification(alert.title, alert.message, alert.type);
        }
      });

      if (hasChanges) {
        // Update ref immediately to prevent duplicate alerts in rapid calls
        notificationsRef.current = current;
        saveNotifications(current);
      }
    } catch (e) {
      console.error('Error checking alerts:', e);
    }
  }, [token, user, apiUrl, saveNotifications, triggerNativeNotification]);
  // ^ notifications NOT in deps — we use notificationsRef instead

  // ── Poll alerts every 5 minutes ───────────────────────────────
  useEffect(() => {
    if (!token || !user) return;
    checkAlerts();
    const interval = setInterval(checkAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token, user, checkAlerts]);

  const clearNotification = (id: string) => {
    saveNotifications(notifications.filter((n) => n.id !== id));
  };

  const clearAll = () => saveNotifications([]);

  const markAsRead = (id: string) => {
    saveNotifications(notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        permission,
        toast,
        showPermissionBanner,
        requestPermission,
        dismissPermissionBanner,
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
