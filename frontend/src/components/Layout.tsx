import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const {
    notifications,
    permission,
    requestPermission,
    clearNotification,
    clearAll,
    markAsRead,
    toast,
    dismissToast
  } = useNotifications();

  const [showDropdown, setShowDropdown] = useState(false);
  const [showMobileDropdown, setShowMobileDropdown] = useState(false);
  
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (showDropdown && desktopRef.current && !desktopRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (showMobileDropdown && mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setShowMobileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showDropdown, showMobileDropdown]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const renderDropdownContent = (closeMenu: () => void) => (
    <div className="absolute right-0 mt-2 w-80 bg-white border border-outline-variant rounded-xl shadow-lg z-50 overflow-hidden py-2">
      <div className="px-4 py-2 border-b border-outline-variant/50 flex justify-between items-center">
        <h3 className="font-bold text-sm text-on-surface">Notifications</h3>
        {notifications.length > 0 && (
          <button
            onClick={() => { clearAll(); closeMenu(); }}
            className="text-xs text-primary hover:underline font-semibold"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-on-surface-variant text-xs flex flex-col items-center justify-center gap-2 select-none">
            <span className="material-symbols-outlined text-outline text-3xl">check_circle</span>
            <p className="font-semibold text-outline">All caught up!</p>
            <p className="text-[10px] text-outline/80">No active tracking alerts.</p>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`p-3 hover:bg-[#f8f9ff]/50 transition-colors flex gap-2 relative ${
                  !n.isRead ? 'bg-[#f8f9ff]' : ''
                }`}
                onClick={() => markAsRead(n.id)}
              >
                <div className="mt-0.5">
                  {n.type === 'finance' && (
                    <span className="material-symbols-outlined text-error text-sm">payments</span>
                  )}
                  {n.type === 'attendance' && (
                    <span className="material-symbols-outlined text-primary text-sm">calendar_today</span>
                  )}
                  {n.type === 'gym' && (
                    <span className="material-symbols-outlined text-tertiary text-sm">fitness_center</span>
                  )}
                  {n.type === 'projects' && (
                    <span className="material-symbols-outlined text-secondary text-sm">account_tree</span>
                  )}
                </div>
                <div className="flex-1 pr-6">
                  <p className="text-xs font-bold text-on-surface leading-tight">{n.title}</p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5 leading-snug">{n.message}</p>
                  <p className="text-[9px] text-outline mt-1 font-data-tabular">{n.timestamp}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearNotification(n.id);
                  }}
                  className="absolute top-2 right-2 text-outline hover:text-error hover:bg-error-container/20 rounded p-0.5"
                  aria-label="Delete notification"
                >
                  <span className="material-symbols-outlined text-xs">close</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {permission === 'default' && (
        <div className="px-4 py-2 border-t border-outline-variant/50 bg-[#f8f9ff] flex items-center justify-between gap-2">
          <p className="text-[10px] text-on-surface-variant font-medium leading-tight font-sans">Enable desktop alerts?</p>
          <button
            onClick={requestPermission}
            className="px-2.5 py-1 bg-primary text-on-primary text-[9px] font-bold rounded hover:bg-primary/95 transition-colors font-sans"
          >
            Enable
          </button>
        </div>
      )}
    </div>
  );

  const navItems = [
    { name: 'Dashboard', path: '/', icon: 'dashboard' },
    { name: 'Attendance', path: '/attendance', icon: 'calendar_today' },
    { name: 'Finance', path: '/finance', icon: 'payments' },
    { name: 'Gym', path: '/gym', icon: 'fitness_center' },
    { name: 'Skincare', path: '/skincare', icon: 'face_6' },
    { name: 'Projects', path: '/projects', icon: 'account_tree' },
    { name: 'Settings', path: '/settings', icon: 'settings' }
  ];

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => {
      dismissToast();
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  return (
    <div className="bg-background text-on-background font-body-md text-body-md antialiased min-h-screen flex flex-col md:flex-row">
      {toast && (
        <div className="fixed top-4 right-4 z-[70] w-[min(92vw,360px)]">
          <div className="bg-surface border border-outline-variant shadow-xl rounded-xl p-3 flex gap-3 items-start animate-[fadeIn_0.2s_ease-out]">
            <div className="mt-0.5">
              {toast.type === 'finance' && <span className="material-symbols-outlined text-error">payments</span>}
              {toast.type === 'attendance' && <span className="material-symbols-outlined text-primary">calendar_today</span>}
              {toast.type === 'gym' && <span className="material-symbols-outlined text-tertiary">fitness_center</span>}
              {toast.type === 'projects' && <span className="material-symbols-outlined text-secondary">account_tree</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-on-surface leading-tight">{toast.title}</p>
              <p className="text-[10px] text-on-surface-variant mt-1 leading-snug">{toast.message}</p>
            </div>
            <button
              onClick={dismissToast}
              className="text-outline hover:text-on-surface"
              aria-label="Dismiss notification"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>
      )}

      {/* SideNavBar Component */}
      <nav className="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 bg-surface shadow-sm border-r border-outline-variant z-40 py-stack-md">
        <div className="px-gutter mb-stack-lg">
          <div className="flex items-center gap-3">
            <img src="/screen.png" alt="FocusFlow Logo" className="w-10 h-10 object-contain font-bold" />
            <div>
              <h1 className="text-headline-md font-headline-md font-bold text-primary tracking-tight">FocusFlow</h1>
              <p className="text-label-sm font-label-sm text-on-surface-variant">Informed Focus</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                      isActive
                        ? 'text-primary font-bold border-r-4 border-primary bg-surface-container-low opacity-90'
                        : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-highest'
                    }`
                  }
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span className="text-body-md font-body-md">{item.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-4 mt-auto">
          <ul className="space-y-1 border-t border-outline-variant/30 pt-4">
            <li>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors duration-200"
              >
                <span className="material-symbols-outlined">logout</span>
                <span className="text-body-md font-body-md font-medium">Logout</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Main Canvas Area */}
      <div className="flex-grow flex flex-col md:pl-64 min-h-screen">
        {/* TopAppBar Component */}
        <header className="hidden md:flex justify-between items-center px-margin-desktop w-full h-16 bg-surface-bright/80 backdrop-blur-md border-b border-outline-variant z-30 fixed top-0 right-0" style={{ width: 'calc(100% - 16rem)' }}>
          <div className="flex items-center gap-4">
            <h2 className="text-headline-md font-headline-md font-bold text-primary">{title}</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden lg:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant" style={{ fontSize: '20px' }}>search</span>
              <input
                className="pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-full text-data-tabular font-data-tabular focus:ring-2 focus:ring-primary focus:border-primary outline-none w-64 transition-all"
                placeholder="Search..."
                type="text"
              />
            </div>
            
            <button
              onClick={() => navigate('/finance')}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg text-label-sm font-label-sm hover:bg-primary/95 transition-colors shadow-sm font-semibold flex items-center gap-2"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
              Log Transaction
            </button>

            <button
              onClick={() => navigate('/attendance')}
              className="px-4 py-2 border border-outline-variant text-primary rounded-lg text-label-sm font-label-sm hover:bg-surface-container transition-colors shadow-sm font-semibold"
            >
              Mark Attendance
            </button>

            {/* Notification Bell (Desktop) */}
            <div className="relative" ref={desktopRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors relative"
                aria-label="Notifications"
              >
                <span className="material-symbols-outlined">notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-error text-on-error rounded-full flex items-center justify-center text-[9px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showDropdown && renderDropdownContent(() => setShowDropdown(false))}
            </div>

            <div className="flex items-center gap-2 ml-2 border-l border-outline-variant/50 pl-4">
              <div className="text-right">
                <p className="text-xs font-semibold text-on-surface">{user?.username}</p>
                <p className="text-[10px] text-outline font-data-tabular font-bold">LKR TRACKER</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm select-none border border-outline-variant">
                {user?.username?.substring(0, 1).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-grow pt-4 md:pt-20 px-margin-mobile md:px-margin-desktop pb-24 md:pb-8">
          <div className="max-w-[1440px] mx-auto">
            <div className="md:hidden flex justify-between items-center py-4 mb-4 border-b border-outline-variant/50">
              <div className="flex items-center gap-2">
                <img src="/screen.png" alt="FocusFlow Logo" className="w-8 h-8 object-contain font-bold" />
                <h1 className="text-stat-value font-bold text-primary">{title}</h1>
              </div>
              <div className="flex items-center gap-3">
                {/* Notification Bell (Mobile) */}
                <div className="relative" ref={mobileRef}>
                  <button
                    onClick={() => setShowMobileDropdown(!showMobileDropdown)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary relative hover:bg-surface-container"
                    aria-label="Notifications"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>notifications</span>
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-error text-on-error rounded-full flex items-center justify-center text-[8px] font-bold">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {showMobileDropdown && renderDropdownContent(() => setShowMobileDropdown(false))}
                </div>

                <button
                  onClick={handleLogout}
                  className="text-on-surface-variant hover:text-error"
                >
                  <span className="material-symbols-outlined">logout</span>
                </button>
              </div>
            </div>

            {children}
          </div>
        </main>
      </div>

      {/* Mobile BottomNavBar (Hidden on md+) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-outline-variant/30 flex justify-around items-center h-16 pb-safe z-50 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)]">
        {navItems.filter(item => item.name !== 'Settings').map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full ${
                isActive ? 'text-primary font-bold' : 'text-on-surface-variant'
              }`
            }
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="text-[10px] font-label-sm font-medium mt-1">{item.name.substring(0, 6)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
