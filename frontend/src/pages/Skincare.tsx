import React, { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface SkincareLogItem {
  id: number;
  date: string;
  routine_type: 'morning' | 'night';
  completed_items: string[];
  skin_rating: number;
  notes: string;
}

interface GroupedDailySkinLog {
  date: string;
  morning?: SkincareLogItem;
  night?: SkincareLogItem;
  skin_rating: number;
  notes: string;
}

export const Skincare: React.FC = () => {
  const { token, apiUrl } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'daily' | 'history' | 'analysis'>('daily');

  const defaultMorning = [
    'Gentle Cleanser',
    'Vitamin C Serum',
    'Moisturizer',
    'Sunscreen (SPF 50)'
  ];

  const defaultNight = [
    'Oil Cleanser (Double Cleanse)',
    'Hydrating Cleanser',
    'Tretinoin 0.025%',
    'Thick Moisturizer'
  ];

  // Today's states
  const [morningCompleted, setMorningCompleted] = useState<string[]>([]);
  const [nightCompleted, setNightCompleted] = useState<string[]>([]);
  const [skinRating, setSkinRating] = useState(4);
  const [notes, setNotes] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  
  // History states
  const [rawLogs, setRawLogs] = useState<SkincareLogItem[]>([]);
  const [searchNotesQuery, setSearchNotesQuery] = useState('');
  const [filterRating, setFilterRating] = useState<number | 'all'>('all');

  const dateStr = new Date().toISOString().split('T')[0];

  const fetchSkincareData = async () => {
    if (!token) return;
    try {
      // 1. Fetch today's log
      const res = await fetch(`${apiUrl}/tracker/skincare/daily?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.morning) {
          setMorningCompleted(data.morning.completed_items || []);
          setSkinRating(data.morning.skin_rating || 4);
          setNotes(data.morning.notes || '');
        }
        if (data.night) {
          setNightCompleted(data.night.completed_items || []);
          if (data.night.notes) setNotes(data.night.notes);
          if (data.night.skin_rating) setSkinRating(data.night.skin_rating);
        }
      }

      // 2. Fetch full history of previous notes and logs
      const historyRes = await fetch(`${apiUrl}/tracker/skincare/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (historyRes.ok) {
        const histData = await historyRes.json();
        setRawLogs(histData);
      }
    } catch (err) {
      console.error('Fetch skincare logs failed:', err);
    }
  };

  useEffect(() => {
    fetchSkincareData();
  }, [token]);

  const saveRoutine = async (type: 'morning' | 'night', checkedList: string[]) => {
    if (!token) return;
    try {
      await fetch(`${apiUrl}/tracker/skincare/daily`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: dateStr,
          routine_type: type,
          completed_items: checkedList,
          skin_rating: skinRating,
          notes: notes
        })
      });
    } catch (err) {
      console.error('Save routine error:', err);
    }
  };

  const handleCheckboxChange = (type: 'morning' | 'night', product: string, checked: boolean) => {
    if (type === 'morning') {
      const newList = checked 
        ? [...morningCompleted, product]
        : morningCompleted.filter(p => p !== product);
      setMorningCompleted(newList);
      saveRoutine('morning', newList);
    } else {
      const newList = checked 
        ? [...nightCompleted, product]
        : nightCompleted.filter(p => p !== product);
      setNightCompleted(newList);
      saveRoutine('night', newList);
    }
  };

  const handleSaveNotesAndRating = async () => {
    if (!token) return;
    try {
      await saveRoutine('morning', morningCompleted);
      await saveRoutine('night', nightCompleted);
      setSaveSuccessMsg('Skin journal note and rating saved!');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
      fetchSkincareData();
    } catch (err) {
      console.error('Save skin info failed:', err);
    }
  };

  const handleDeleteLog = async (id: number) => {
    if (!window.confirm('Delete this skincare routine entry?')) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/skincare/logs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchSkincareData();
      }
    } catch (err) {
      console.error('Delete skincare log failed:', err);
    }
  };

  // Group raw logs by date for historical journal view
  const groupedDailyLogs = useMemo(() => {
    const map: Record<string, GroupedDailySkinLog> = {};
    rawLogs.forEach(item => {
      if (!map[item.date]) {
        map[item.date] = {
          date: item.date,
          skin_rating: item.skin_rating || 4,
          notes: item.notes || ''
        };
      }
      if (item.routine_type === 'morning') {
        map[item.date].morning = item;
      } else if (item.routine_type === 'night') {
        map[item.date].night = item;
      }
      if (item.notes && !map[item.date].notes) {
        map[item.date].notes = item.notes;
      }
      if (item.skin_rating) {
        map[item.date].skin_rating = item.skin_rating;
      }
    });

    return Object.values(map).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rawLogs]);

  // Filtered historical logs
  const filteredHistory = useMemo(() => {
    return groupedDailyLogs.filter(day => {
      const matchesSearch = !searchNotesQuery || 
        (day.notes && day.notes.toLowerCase().includes(searchNotesQuery.toLowerCase())) ||
        day.date.includes(searchNotesQuery);
      
      const matchesRating = filterRating === 'all' || day.skin_rating === filterRating;

      return matchesSearch && matchesRating;
    });
  }, [groupedDailyLogs, searchNotesQuery, filterRating]);

  // Smart Skincare Analysis Calculations
  const smartAnalysis = useMemo(() => {
    const totalDays = groupedDailyLogs.length;
    if (totalDays === 0) {
      return {
        totalDays: 0,
        morningAdherence: 0,
        nightAdherence: 0,
        avgRating: 0,
        ratingCount: {},
        topProducts: [],
        insights: ['Start logging your daily morning and night skincare rituals to unlock smart dermatological insights!']
      };
    }

    let morningDoneCount = 0;
    let nightDoneCount = 0;
    let sumRating = 0;
    const ratingCount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const productUsage: Record<string, number> = {};

    groupedDailyLogs.forEach(d => {
      if (d.morning && d.morning.completed_items.length >= 2) morningDoneCount++;
      if (d.night && d.night.completed_items.length >= 2) nightDoneCount++;
      sumRating += d.skin_rating || 4;
      ratingCount[d.skin_rating || 4] = (ratingCount[d.skin_rating || 4] || 0) + 1;

      if (d.morning) {
        d.morning.completed_items.forEach(p => {
          productUsage[p] = (productUsage[p] || 0) + 1;
        });
      }
      if (d.night) {
        d.night.completed_items.forEach(p => {
          productUsage[p] = (productUsage[p] || 0) + 1;
        });
      }
    });

    const morningAdherence = Math.round((morningDoneCount / totalDays) * 100);
    const nightAdherence = Math.round((nightDoneCount / totalDays) * 100);
    const avgRating = (sumRating / totalDays).toFixed(1);

    const topProducts = Object.entries(productUsage)
      .map(([name, count]) => ({
        name,
        count,
        pct: Math.min(100, Math.round((count / totalDays) * 100))
      }))
      .sort((a, b) => b.count - a.count);

    const insights: string[] = [];
    if (nightAdherence >= 80) {
      insights.push(`🌟 Night routine consistency is outstanding (${nightAdherence}%). Cellular skin recovery occurs predominantly during sleep.`);
    } else {
      insights.push(`🌙 Night routine completion is at ${nightAdherence}%. Prioritize double cleansing and moisturizer before bed for clearer barrier health.`);
    }

    if (productUsage['Sunscreen (SPF 50)']) {
      const spfPct = Math.min(100, Math.round((productUsage['Sunscreen (SPF 50)'] / totalDays) * 100));
      if (spfPct >= 75) {
        insights.push(`☀️ High UV protection adherence (${spfPct}%). Sunscreen is the #1 anti-aging and anti-blemish shield.`);
      } else {
        insights.push(`⚠️ Sunscreen was applied on only ${spfPct}% of logged days. Consistent daily SPF prevents post-acne hyperpigmentation.`);
      }
    }

    if (Number(avgRating) >= 4.0) {
      insights.push(`✨ Average skin condition rating is ${avgRating}/5. Your skin barrier is thriving with your current product rotation.`);
    } else {
      insights.push(`💧 Average skin rating is ${avgRating}/5. Track journal notes closely to identify breakout triggers or product irritations.`);
    }

    return {
      totalDays,
      morningAdherence,
      nightAdherence,
      avgRating,
      ratingCount,
      topProducts,
      insights
    };
  }, [groupedDailyLogs]);

  return (
    <Layout title="Skincare Routine">
      <div className="space-y-stack-lg">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-background mb-2">Skincare Routine</h1>
            <p className="text-body-md font-body-md text-on-surface-variant">Track your morning and night rituals, read previous skin notes, and review smart skin quality trends.</p>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant shadow-sm w-fit self-end">
            <button
              onClick={() => setActiveTab('daily')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'daily' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Today's Ritual
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'history' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">history_edu</span>
              Previous Notes & Logs ({groupedDailyLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'analysis' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">insights</span>
              Smart Analysis
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Tab 1: Today's Routine Checklist */}
        {/* ========================================================================= */}
        {activeTab === 'daily' && (
          <div className="space-y-stack-md">
            {saveSuccessMsg && (
              <div className="p-3 bg-secondary/15 border border-secondary/30 text-secondary text-xs rounded-xl flex items-center gap-2 font-medium max-w-xl mx-auto animate-fadeIn">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {saveSuccessMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
              {/* Morning Routine Checklist */}
              <div className="md:col-span-4 bg-white border border-outline-variant rounded-xl shadow-sm p-6 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-secondary"></div>
                <div className="flex items-center gap-3 mb-6 border-b border-outline-variant/30 pb-4">
                  <div className="w-10 h-10 rounded-full bg-secondary-container/20 flex items-center justify-center text-secondary">
                    <span className="material-symbols-outlined">wb_sunny</span>
                  </div>
                  <div>
                    <h3 className="text-headline-md font-headline-md font-bold text-on-surface">Morning Routine</h3>
                    <p className="text-[11px] text-outline">Daylight protection & hydration</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {defaultMorning.map((prod) => {
                    const checked = morningCompleted.includes(prod);
                    return (
                      <label key={prod} className="flex items-start gap-3 cursor-pointer group/item p-2 rounded-lg hover:bg-surface-bright transition-colors">
                        <div className="relative flex items-start pt-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => handleCheckboxChange('morning', prod, e.target.checked)}
                            className="w-5 h-5 border-outline-variant rounded text-secondary focus:ring-secondary focus:ring-offset-0 bg-[#f8f9ff] cursor-pointer"
                          />
                        </div>
                        <div className="flex-1">
                          <p className={`text-body-md font-medium transition-colors ${
                            checked ? 'text-secondary line-through opacity-70' : 'text-on-surface hover:text-secondary'
                          }`}>{prod}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Night Routine Checklist */}
              <div className="md:col-span-4 bg-white border border-outline-variant rounded-xl shadow-sm p-6 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-primary"></div>
                <div className="flex items-center gap-3 mb-6 border-b border-outline-variant/30 pb-4">
                  <div className="w-10 h-10 rounded-full bg-primary-container/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">dark_mode</span>
                  </div>
                  <div>
                    <h3 className="text-headline-md font-headline-md font-bold text-on-surface">Night Routine</h3>
                    <p className="text-[11px] text-outline">Double cleanse & recovery actives</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {defaultNight.map((prod) => {
                    const checked = nightCompleted.includes(prod);
                    return (
                      <label key={prod} className="flex items-start gap-3 cursor-pointer group/item p-2 rounded-lg hover:bg-surface-bright transition-colors">
                        <div className="relative flex items-start pt-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => handleCheckboxChange('night', prod, e.target.checked)}
                            className="w-5 h-5 border-outline-variant rounded text-primary focus:ring-primary focus:ring-offset-0 bg-[#f8f9ff] cursor-pointer"
                          />
                        </div>
                        <div className="flex-1">
                          <p className={`text-body-md font-medium transition-colors ${
                            checked ? 'text-primary line-through opacity-70' : 'text-on-surface hover:text-primary'
                          }`}>{prod}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Skin Health Rating Today */}
              <div className="md:col-span-4 flex flex-col gap-gutter">
                <div className="bg-white border border-outline-variant rounded-xl shadow-sm p-6 flex-1">
                  <h3 className="text-body-md font-bold text-on-surface mb-2">Today's Skin Quality</h3>
                  <p className="text-xs text-outline mb-4">How does your skin look & feel today?</p>
                  
                  <div className="flex items-center justify-between mb-6 bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSkinRating(star)}
                          className="focus:outline-none hover:scale-110 transition-transform"
                        >
                          <span
                            className={`material-symbols-outlined text-[28px] ${
                              star <= skinRating ? 'text-secondary icon-fill' : 'text-outline-variant'
                            }`}
                          >
                            star
                          </span>
                        </button>
                      ))}
                    </div>
                    <span className="text-stat-value font-bold text-on-surface font-data-tabular">{skinRating}/5</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-outline">
                      <span>Ritual Tasks Met Today</span>
                      <span>
                        {morningCompleted.length + nightCompleted.length} / {defaultMorning.length + defaultNight.length} Done
                      </span>
                    </div>
                    <div className="w-full bg-surface-container rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-secondary h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round(
                            ((morningCompleted.length + nightCompleted.length) /
                              (defaultMorning.length + defaultNight.length)) *
                              100
                          )}%`
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Journal Note entry */}
              <div className="md:col-span-12 bg-white border border-outline-variant rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary">edit_note</span>
                  <h3 className="text-headline-md font-headline-md font-bold text-on-surface">Daily Skin Journal Note</h3>
                </div>
                <p className="text-xs text-outline mb-4">Record breakout observations, dryness, sun exposure, or product reactions.</p>
                
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-xl p-4 text-body-md focus:ring-2 focus:ring-primary focus:outline-none resize-none h-28"
                  placeholder="e.g. Cheeks feeling slightly sensitive after retinol; applied extra layer of moisturizer. No new breakouts..."
                ></textarea>
                
                <div className="flex justify-end mt-4">
                  <button
                    onClick={handleSaveNotesAndRating}
                    className="bg-primary text-on-primary px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/95 transition-all shadow-sm active:scale-98 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">save</span>
                    Save Skin Journal & Rating
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 2: Previous Notes and Logs Timeline List */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <div className="bg-white border border-outline-variant rounded-xl shadow-sm p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-outline-variant/40">
              <div>
                <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">auto_stories</span>
                  Previous Skincare Notes & Logs
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Review your past skin journal notes, product completion, and quality ratings</p>
              </div>

              {/* Rating Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-outline uppercase mr-1">Filter:</span>
                <button
                  onClick={() => setFilterRating('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                    filterRating === 'all' ? 'bg-primary text-on-primary border-primary' : 'bg-surface-bright text-outline border-outline-variant'
                  }`}
                >
                  All
                </button>
                {[5, 4, 3, 2, 1].map(r => (
                  <button
                    key={r}
                    onClick={() => setFilterRating(r)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all border flex items-center gap-0.5 ${
                      filterRating === r ? 'bg-secondary text-white border-secondary' : 'bg-surface-bright text-outline border-outline-variant'
                    }`}
                  >
                    <span>{r}</span>
                    <span className="material-symbols-outlined text-xs icon-fill">star</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
              <input
                type="text"
                value={searchNotesQuery}
                onChange={(e) => setSearchNotesQuery(e.target.value)}
                placeholder="Search notes keywords (e.g. breakout, dry, retinol, sensitive)..."
                className="w-full pl-9 pr-4 py-2.5 bg-[#f8f9ff] border border-outline-variant rounded-lg text-xs focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            {/* List of Previous Logs and Notes */}
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant bg-surface-bright rounded-xl border border-outline-variant/30">
                <span className="material-symbols-outlined text-outline" style={{ fontSize: '40px' }}>note_alt</span>
                <p className="text-sm font-semibold mt-2">No previous skincare logs match your filter.</p>
                <p className="text-xs text-outline mt-0.5">Logs and notes will appear here chronologically as you complete your routines!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredHistory.map((day) => (
                  <div key={day.date} className="p-5 rounded-xl bg-[#f8f9ff] border border-outline-variant/40 space-y-3 hover:border-primary/40 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/20 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-on-background font-data-tabular">
                          {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {day.date === dateStr && (
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">
                            Today
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Rating Stars */}
                        <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-outline-variant/30">
                          <span className="text-xs font-bold text-on-surface font-data-tabular mr-1">{day.skin_rating}/5</span>
                          {[1, 2, 3, 4, 5].map(s => (
                            <span
                              key={s}
                              className={`material-symbols-outlined text-sm ${
                                s <= day.skin_rating ? 'text-secondary icon-fill' : 'text-outline-variant'
                              }`}
                            >
                              star
                            </span>
                          ))}
                        </div>

                        {/* Delete entry action if available */}
                        {day.morning?.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteLog(day.morning!.id)}
                            className="p-1 text-outline hover:text-error hover:bg-error-container/20 rounded transition-colors"
                            title="Delete morning log"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Ritual Completion Tags */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      <div className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
                        day.morning && day.morning.completed_items.length > 0 
                          ? 'bg-secondary/10 border-secondary/20 text-secondary' 
                          : 'bg-surface-container text-outline border-outline-variant/30'
                      }`}>
                        <span className="material-symbols-outlined text-xs">wb_sunny</span>
                        <span className="font-semibold">Morning: {day.morning?.completed_items?.length || 0} / {defaultMorning.length} Done</span>
                      </div>

                      <div className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
                        day.night && day.night.completed_items.length > 0 
                          ? 'bg-primary/10 border-primary/20 text-primary' 
                          : 'bg-surface-container text-outline border-outline-variant/30'
                      }`}>
                        <span className="material-symbols-outlined text-xs">dark_mode</span>
                        <span className="font-semibold">Night: {day.night?.completed_items?.length || 0} / {defaultNight.length} Done</span>
                      </div>
                    </div>

                    {/* Skin Notes display */}
                    <div className="bg-white p-3.5 rounded-lg border border-outline-variant/30">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-outline uppercase tracking-wider mb-1">
                        <span className="material-symbols-outlined text-xs text-primary">notes</span>
                        Skin Journal Note:
                      </div>
                      {day.notes ? (
                        <p className="text-xs text-on-surface font-medium leading-relaxed italic">
                          "{day.notes}"
                        </p>
                      ) : (
                        <p className="text-xs text-outline italic">
                          No notes written for this day.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 3: Smart Skincare Analysis */}
        {/* ========================================================================= */}
        {activeTab === 'analysis' && (
          <div className="space-y-stack-md max-w-5xl mx-auto">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {/* Avg Skin Quality Rating */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-secondary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Avg Skin Score</span>
                    <span className="material-symbols-outlined icon-fill">star</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {smartAnalysis.avgRating} <span className="text-headline-md text-outline">/ 5.0</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-on-surface-variant font-medium">
                  Across {smartAnalysis.totalDays} logged skin journal days
                </div>
              </div>

              {/* Morning Routine Adherence */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-secondary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Morning Adherence</span>
                    <span className="material-symbols-outlined">wb_sunny</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {smartAnalysis.morningAdherence}%
                  </div>
                </div>
                <div className="mt-3">
                  <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div className="bg-secondary h-full rounded-full" style={{ width: `${smartAnalysis.morningAdherence}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Night Routine Adherence */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-primary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Night Adherence</span>
                    <span className="material-symbols-outlined">dark_mode</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {smartAnalysis.nightAdherence}%
                  </div>
                </div>
                <div className="mt-3">
                  <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${smartAnalysis.nightAdherence}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Sunscreen Compliance */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-secondary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Sunscreen Rate</span>
                    <span className="material-symbols-outlined">shield</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {smartAnalysis.topProducts.find(p => p.name.includes('Sunscreen'))?.pct || 0}%
                  </div>
                </div>
                <div className="mt-3 text-xs text-on-surface-variant font-medium">
                  SPF 50 daily photoprotection rate
                </div>
              </div>
            </div>

            {/* Smart Dermatological Observations */}
            <div className="bg-gradient-to-r from-secondary-container/20 via-surface-container-low to-primary-container/10 border border-secondary/25 rounded-xl p-6 shadow-sm">
              <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-secondary">psychology</span>
                Smart Dermatological Insights
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {smartAnalysis.insights.map((insight, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-outline-variant/30 shadow-xs text-xs text-on-surface font-medium leading-relaxed">
                    {insight}
                  </div>
                ))}
              </div>
            </div>

            {/* Product Adherence Breakdown */}
            <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
              <h3 className="text-headline-md font-bold text-on-background border-l-4 border-primary pl-3 mb-4">Product Application Adherence</h3>
              <p className="text-xs text-outline mb-6">Percentage of logged days each skincare active or cleanser was applied.</p>

              {smartAnalysis.topProducts.length === 0 ? (
                <p className="text-xs text-outline text-center py-6">No product logs recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {smartAnalysis.topProducts.map((p, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-on-surface">{p.name}</span>
                        <span className="font-data-tabular text-primary font-bold">{p.pct}% ({p.count} days)</span>
                      </div>
                      <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${p.pct}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
