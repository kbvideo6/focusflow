import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

export const Skincare: React.FC = () => {
  const { token, apiUrl } = useAuth();
  
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

  const [morningCompleted, setMorningCompleted] = useState<string[]>([]);
  const [nightCompleted, setNightCompleted] = useState<string[]>([]);
  const [skinRating, setSkinRating] = useState(4);
  const [notes, setNotes] = useState('');
  
  const dateStr = new Date().toISOString().split('T')[0];

  const fetchSkincareData = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/skincare/daily?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.morning) {
          setMorningCompleted(data.morning.completed_items || []);
          // Sync rating and notes from morning or night logs
          setSkinRating(data.morning.skin_rating || 4);
          setNotes(data.morning.notes || '');
        }
        if (data.night) {
          setNightCompleted(data.night.completed_items || []);
          if (data.night.notes) setNotes(data.night.notes);
          if (data.night.skin_rating) setSkinRating(data.night.skin_rating);
        }
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
      // Save rating & notes to whatever routine has progress, or both
      await saveRoutine('morning', morningCompleted);
      await saveRoutine('night', nightCompleted);
      alert('Skin journal and rating updated!');
    } catch (err) {
      console.error('Save skin info failed:', err);
    }
  };

  return (
    <Layout title="Skincare Routine">
      <div className="space-y-stack-lg">
        {/* Header Title */}
        <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-background mb-2">Skincare Routine</h1>
            <p className="text-body-md font-body-md text-on-surface-variant">Track your daily morning and night skin rituals.</p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-secondary-container/30 text-secondary border border-secondary/20 rounded-full text-label-sm font-label-sm flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>water_drop</span>
              Skin Hydrated
            </span>
          </div>
        </div>

        {/* Bento Grid: Morning, Night checklists & Ratings */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          {/* Morning Routine Checklist */}
          <div className="md:col-span-4 bg-white border border-outline-variant rounded-xl shadow-sm p-6 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-secondary"></div>
            <div className="flex items-center gap-3 mb-6 border-b border-outline-variant/30 pb-4">
              <div className="w-10 h-10 rounded-full bg-secondary-container/20 flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined">wb_sunny</span>
              </div>
              <h3 className="text-headline-md font-headline-md font-bold text-on-surface">Morning Routine</h3>
            </div>
            
            <div className="space-y-4">
              {defaultMorning.map((prod) => {
                const checked = morningCompleted.includes(prod);
                return (
                  <label key={prod} className="flex items-start gap-3 cursor-pointer group/item">
                    <div className="relative flex items-start pt-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleCheckboxChange('morning', prod, e.target.checked)}
                        className="w-5 h-5 border-outline-variant rounded text-secondary focus:ring-secondary focus:ring-offset-0 bg-[#f8f9ff] cursor-pointer transition-colors"
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
            <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
            <div className="flex items-center gap-3 mb-6 border-b border-outline-variant/30 pb-4">
              <div className="w-10 h-10 rounded-full bg-primary-container/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">dark_mode</span>
              </div>
              <h3 className="text-headline-md font-headline-md font-bold text-on-surface">Night Routine</h3>
            </div>

            <div className="space-y-4">
              {defaultNight.map((prod) => {
                const checked = nightCompleted.includes(prod);
                return (
                  <label key={prod} className="flex items-start gap-3 cursor-pointer group/item">
                    <div className="relative flex items-start pt-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleCheckboxChange('night', prod, e.target.checked)}
                        className="w-5 h-5 border-outline-variant rounded text-primary focus:ring-primary focus:ring-offset-0 bg-[#f8f9ff] cursor-pointer transition-colors"
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
              <h3 className="text-body-md font-bold text-on-surface mb-4">Today's Skin Quality</h3>
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setSkinRating(star)}
                      className="focus:outline-none"
                    >
                      <span
                        className={`material-symbols-outlined text-[26px] ${
                          star <= skinRating ? 'text-secondary icon-fill' : 'text-outline-variant'
                        }`}
                      >
                        star
                      </span>
                    </button>
                  ))}
                </div>
                <span className="text-stat-value font-bold text-on-surface">{skinRating}/5</span>
              </div>
              
              <div className="space-y-2 mt-6">
                <div className="flex justify-between text-xs font-semibold text-outline">
                  <span>Skincare Tasks Met</span>
                  <span>
                    {morningCompleted.length + nightCompleted.length} / {defaultMorning.length + defaultNight.length} Done
                  </span>
                </div>
                <div className="w-full bg-surface-container rounded-full h-2">
                  <div
                    className="bg-secondary h-2 rounded-full transition-all duration-300"
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
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">edit_note</span>
              <h3 className="text-headline-md font-headline-md font-bold text-on-surface">Skin Log Notes</h3>
            </div>
            
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#f8f9ff] border border-outline-variant rounded-xl p-4 text-body-md focus:ring-2 focus:ring-primary focus:outline-none resize-none h-28"
              placeholder="Note breakouts, dryness, hydration, or reactions to new products..."
            ></textarea>
            
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveNotesAndRating}
                className="px-6 py-2.5 bg-primary text-on-primary rounded-full text-label-sm font-semibold hover:bg-primary/95 transition-all shadow-sm active:scale-95 duration-100"
              >
                Save Notes & Rating
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
