import React, { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface Subject {
  id: number;
  name: string;
  attendance_target: number;
  attendance_target_required: number; // 0 = false, 1 = true
  priority: string;
  effort_needed: string;
  projected_grade: string;
  current_marks?: number;
  present_count: number;
  absent_count: number;
  medical_count: number;
  cancelled_count?: number;
  percentage: number;
  safetyStatus: string;
  message: string;
}

interface AttendanceLog {
  id: number;
  date: string;
  status: string;
  subject_name: string;
  notes?: string;
}

export const Attendance: React.FC = () => {
  const { token, apiUrl } = useAuth();
  
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [history, setHistory] = useState<AttendanceLog[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'absences'>('all');

  // Filter states
  const [subjectFilter, setSubjectFilter] = useState<'all' | 'mat' | 'phy' | 'ees' | 'others'>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal / Add Form states
  const [showModal, setShowModal] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubPriority, setNewSubPriority] = useState('Medium');
  const [newSubEffort, setNewSubEffort] = useState('Medium');
  const [newSubGrade, setNewSubGrade] = useState('A');
  const [newSubMarks, setNewSubMarks] = useState<number>(85);
  const [newSubTargetRequired, setNewSubTargetRequired] = useState(true);
  const [error, setError] = useState('');

  // Marks Edit Modal states
  const [marksModalOpen, setMarksModalOpen] = useState(false);
  const [targetSubToEdit, setTargetSubToEdit] = useState<Subject | null>(null);
  const [editMarksVal, setEditMarksVal] = useState<number>(0);
  const [editGradeVal, setEditGradeVal] = useState<string>('A');

  // Quick log states
  const [logSubName, setLogSubName] = useState('');
  const [logStatus, setLogStatus] = useState('present');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logNotes, setLogNotes] = useState('');

  // Selected Subject Detail Modal & Notes Edit states
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [modalLogStatus, setModalLogStatus] = useState('present');
  const [modalLogDate, setModalLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalLogNotes, setModalLogNotes] = useState('');

  // Editing log states
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editLogStatus, setEditLogStatus] = useState('present');
  const [editLogDate, setEditLogDate] = useState('');
  const [editLogNotes, setEditLogNotes] = useState('');

  // Timetable view & import states
  const [viewMode, setViewMode] = useState<'subjects' | 'worksheet' | 'analytics'>('subjects');
  const [showTimetableModal, setShowTimetableModal] = useState(false);
  const [timetableSlots, setTimetableSlots] = useState<any[]>([]);

  // Weekly Worksheet states
  const getMondayOfCurrentWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  };
  const [weekStartDate, setWeekStartDate] = useState(getMondayOfCurrentWeek());
  const [schedule, setSchedule] = useState<any[]>([]);

  // Auto-sync selected subject stats when subjects array is updated
  useEffect(() => {
    if (selectedSubject) {
      const updated = subjects.find(s => s.id === selectedSubject.id);
      if (updated) {
        setSelectedSubject(updated);
      }
    }
  }, [subjects]);

  const fetchTimetable = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/timetable`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setTimetableSlots(await res.json());
    } catch (err) {
      console.error('Fetch timetable error:', err);
    }
  };

  const getFridayOfCurrentWeek = (mondayStr: string) => {
    const monday = new Date(mondayStr);
    monday.setDate(monday.getDate() + 4);
    return monday.toISOString().split('T')[0];
  };

  const fetchSchedule = async () => {
    if (!token) return;
    try {
      const friday = getFridayOfCurrentWeek(weekStartDate);
      const res = await fetch(`${apiUrl}/tracker/timetable/schedule?startDate=${weekStartDate}&endDate=${friday}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSchedule(await res.json());
      }
    } catch (err) {
      console.error('Fetch schedule error:', err);
    }
  };

  const fetchData = async (start = startDateFilter, end = endDateFilter) => {
    if (!token) return;
    try {
      let subUrl = `${apiUrl}/tracker/subjects`;
      let histUrl = `${apiUrl}/tracker/attendance/history`;
      
      const queryParams = [];
      if (start) queryParams.push(`startDate=${start}`);
      if (end) queryParams.push(`endDate=${end}`);
      
      if (queryParams.length > 0) {
        const queryStr = `?${queryParams.join('&')}`;
        subUrl += queryStr;
        histUrl += queryStr;
      }

      const subRes = await fetch(subUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (subRes.ok) setSubjects(await subRes.json());

      const histRes = await fetch(histUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (histRes.ok) setHistory(await histRes.json());
    } catch (err) {
      console.error('Fetch attendance error:', err);
    }
  };

  useEffect(() => {
    fetchData(startDateFilter, endDateFilter);
    fetchTimetable();
  }, [token, startDateFilter, endDateFilter]);

  useEffect(() => {
    if (viewMode === 'worksheet') {
      fetchSchedule();
    }
  }, [token, weekStartDate, viewMode]);

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newSubName.trim()) {
      setError('Subject name is required.');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/tracker/subjects/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newSubName.trim(),
          priority: newSubPriority,
          effort_needed: newSubEffort,
          projected_grade: newSubGrade,
          current_marks: newSubMarks,
          attendance_target_required: newSubTargetRequired ? 1 : 0
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add subject');
        return;
      }

      setNewSubName('');
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error occurred');
    }
  };

  const handleOpenMarksModal = (sub: Subject) => {
    setTargetSubToEdit(sub);
    setEditMarksVal(sub.current_marks !== undefined ? sub.current_marks : 0);
    setEditGradeVal(sub.projected_grade || 'A');
    setMarksModalOpen(true);
  };

  const handleSaveMarksAndGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSubToEdit || !token) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/subjects/${targetSubToEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: targetSubToEdit.name,
          attendance_target: targetSubToEdit.attendance_target,
          attendance_target_required: targetSubToEdit.attendance_target_required,
          priority: targetSubToEdit.priority,
          effort_needed: targetSubToEdit.effort_needed,
          projected_grade: editGradeVal,
          current_marks: editMarksVal
        })
      });
      if (res.ok) {
        setMarksModalOpen(false);
        setTargetSubToEdit(null);
        fetchData();
      }
    } catch (err) {
      console.error('Save marks error:', err);
    }
  };

  // SMART ATTENDANCE & MARKS ANALYTICS
  const academicStats = useMemo(() => {
    const totalSubjects = subjects.length;
    if (totalSubjects === 0) {
      return {
        overallAttendancePct: 0,
        avgMarks: 0,
        projectedGPA: '0.00',
        criticalCount: 0,
        safeCount: 0,
        cautionCount: 0,
        quadrants: { excelling: [] as Subject[], attendanceRisk: [] as Subject[], supportNeeded: [] as Subject[], critical: [] as Subject[] },
        gradeDistribution: {} as Record<string, number>,
        insights: ['Add your enrolled courses to calculate academic marks and attendance runway analytics.']
      };
    }

    let totalPresent = 0;
    let totalClasses = 0;
    let sumMarks = 0;
    let gpaSum = 0;
    let criticalCount = 0;
    let safeCount = 0;
    let cautionCount = 0;

    const gradeToGPA: Record<string, number> = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D': 1.0, 'F': 0.0
    };

    const gradeDistribution: Record<string, number> = {};

    const quadrants: {
      excelling: Subject[];
      attendanceRisk: Subject[];
      supportNeeded: Subject[];
      critical: Subject[];
    } = {
      excelling: [],
      attendanceRisk: [],
      supportNeeded: [],
      critical: []
    };

    subjects.forEach(sub => {
      totalPresent += sub.present_count;
      const subClasses = sub.present_count + sub.absent_count;
      totalClasses += subClasses;

      const marks = sub.current_marks !== undefined ? sub.current_marks : 0;
      sumMarks += marks;

      const normalizedGrade = sub.projected_grade?.trim().toUpperCase() || 'A';
      const subGPA = gradeToGPA[normalizedGrade] !== undefined ? gradeToGPA[normalizedGrade] : 3.5;
      gpaSum += subGPA;

      gradeDistribution[normalizedGrade] = (gradeDistribution[normalizedGrade] || 0) + 1;

      if (sub.safetyStatus === 'CRITICAL' || marks < 50) criticalCount++;
      else if (sub.safetyStatus === 'CAUTION') cautionCount++;
      else safeCount++;

      // Quadrant grouping
      const target = sub.attendance_target || 80;
      if (sub.percentage >= target && marks >= 70) {
        quadrants.excelling.push(sub);
      } else if (sub.percentage < target && marks >= 70) {
        quadrants.attendanceRisk.push(sub);
      } else if (sub.percentage >= target && marks < 70) {
        quadrants.supportNeeded.push(sub);
      } else {
        quadrants.critical.push(sub);
      }
    });

    const overallAttendancePct = totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 100;
    const avgMarks = Math.round(sumMarks / totalSubjects);
    const projectedGPA = (gpaSum / totalSubjects).toFixed(2);

    const insights: string[] = [];
    if (overallAttendancePct >= 80) {
      insights.push(`🎓 Overall Semester Attendance is at ${overallAttendancePct}%, safely meeting the institutional 80% threshold across all modules.`);
    } else {
      insights.push(`🚨 Overall Semester Attendance is ${overallAttendancePct}%, below the required 80% benchmark. Immediate attendance recovery is required.`);
    }

    if (quadrants.attendanceRisk.length > 0) {
      insights.push(`⚠️ Debarment Warning: ${quadrants.attendanceRisk.length} course(s) have solid marks (≥70%) but sub-80% attendance. Attend upcoming classes to prevent exam disqualification.`);
    }

    if (quadrants.critical.length > 0) {
      insights.push(`🛑 High Alert: ${quadrants.critical.length} module(s) (${quadrants.critical.map(s => s.name).join(', ')}) require urgent intervention in both attendance and assessments.`);
    }

    if (avgMarks >= 75) {
      insights.push(`⭐ Projected GPA is ${projectedGPA} with an average assessment mark of ${avgMarks}%. You are performing on Dean's List trajectory.`);
    }

    return {
      overallAttendancePct,
      avgMarks,
      projectedGPA,
      criticalCount,
      safeCount,
      cautionCount,
      quadrants,
      gradeDistribution,
      insights
    };
  }, [subjects]);

  const handleDeleteSubject = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this course subject? This will permanently delete the subject and all its attendance logs.')) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/subjects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedSubject(null);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete subject');
      }
    } catch (err) {
      console.error('Delete subject failed:', err);
    }
  };

  const handleQuickLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logSubName) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/attendance/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          subject_name: logSubName,
          date: logDate,
          status: logStatus,
          notes: logNotes
        })
      });

      if (res.ok) {
        setLogNotes('');
        fetchData();
      }
    } catch (err) {
      console.error('Error logging class:', err);
    }
  };

  const handleDeleteLog = async (id: number) => {
    if (!window.confirm('Delete this attendance log?')) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/attendance/log/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Delete log failed:', err);
    }
  };

  const handleAddModalLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/attendance/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          subject_name: selectedSubject.name,
          date: modalLogDate,
          status: modalLogStatus,
          notes: modalLogNotes
        })
      });

      if (res.ok) {
        setModalLogNotes('');
        fetchData();
      }
    } catch (err) {
      console.error('Error logging class from modal:', err);
    }
  };

  const handleUpdateLog = async (id: number) => {
    try {
      const res = await fetch(`${apiUrl}/tracker/attendance/log/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: editLogDate,
          status: editLogStatus,
          notes: editLogNotes
        })
      });

      if (res.ok) {
        setEditingLogId(null);
        fetchData();
        if (viewMode === 'worksheet') fetchSchedule();
      }
    } catch (err) {
      console.error('Update log failed:', err);
    }
  };

  const handleToggleAttendance = async (item: any, newStatus: string) => {
    if (!token) return;
    try {
      if (item.log) {
        if (newStatus === 'unmarked') {
          const res = await fetch(`${apiUrl}/tracker/attendance/log/${item.log.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            await fetchData();
            await fetchSchedule();
          }
        } else {
          const res = await fetch(`${apiUrl}/tracker/attendance/log/${item.log.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              date: item.date,
              status: newStatus,
              notes: item.log.notes || ''
            })
          });
          if (res.ok) {
            await fetchData();
            await fetchSchedule();
          }
        }
      } else {
        if (newStatus !== 'unmarked') {
          const res = await fetch(`${apiUrl}/tracker/attendance/log`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              subject_name: item.subjectName,
              date: item.date,
              status: newStatus,
              notes: ''
            })
          });
          if (res.ok) {
            await fetchData();
            await fetchSchedule();
          }
        }
      }
    } catch (err) {
      console.error('Toggle attendance error:', err);
    }
  };

  const handleSaveScheduleNotes = async (item: any, notesText: string) => {
    if (!token) return;
    try {
      if (item.log) {
        const res = await fetch(`${apiUrl}/tracker/attendance/log/${item.log.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            date: item.date,
            status: item.log.status,
            notes: notesText
          })
        });
        if (res.ok) {
          await fetchData();
          await fetchSchedule();
        }
      } else {
        const res = await fetch(`${apiUrl}/tracker/attendance/log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            subject_name: item.subjectName,
            date: item.date,
            status: 'present',
            notes: notesText
          })
        });
        if (res.ok) {
          await fetchData();
          await fetchSchedule();
        }
      }
    } catch (err) {
      console.error('Save schedule notes error:', err);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      try {
        const res = await fetch(`${apiUrl}/tracker/timetable/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ csvText: text })
        });

        if (res.ok) {
          alert('Timetable CSV imported successfully! Unique subjects have been added to your tracker.');
          fetchTimetable();
          fetchData();
          if (viewMode === 'worksheet') fetchSchedule();
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to import CSV');
        }
      } catch (err) {
        console.error('Import CSV error:', err);
        alert('Error importing CSV.');
      }
    };
    reader.readAsText(file);
  };

  const filteredHistory = history.filter(log => {
    const nameLower = log.subject_name.toLowerCase();
    
    // 1. Tab filter (All vs Absences Only)
    if (activeTab === 'absences' && log.status !== 'absent') return false;
    
    // 2. Category filter
    const isMat = nameLower.split(/[\s()\-/_]+/).some(word => word.startsWith('mat'));
    const isPhy = nameLower.split(/[\s()\-/_]+/).some(word => word.startsWith('phy') || word.startsWith('ohy'));
    const isEes = nameLower.split(/[\s()\-/_]+/).some(word => word.startsWith('ees'));

    if (subjectFilter === 'mat' && !isMat) return false;
    if (subjectFilter === 'phy' && !isPhy) return false;
    if (subjectFilter === 'ees' && !isEes) return false;
    if (subjectFilter === 'others' && (isMat || isPhy || isEes)) return false;
    
    // 3. Search query
    if (searchQuery && !nameLower.includes(searchQuery.toLowerCase())) return false;
    
    // 4. Date filters
    if (startDateFilter && log.date < startDateFilter) return false;
    if (endDateFilter && log.date > endDateFilter) return false;
    
    return true;
  });

  const filteredSubjects = subjects.filter(sub => {
    const nameLower = sub.name.toLowerCase();
    // Apply search query
    if (searchQuery && !nameLower.includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Apply category filter
    const isMat = nameLower.split(/[\s()\-/_]+/).some(word => word.startsWith('mat'));
    const isPhy = nameLower.split(/[\s()\-/_]+/).some(word => word.startsWith('phy') || word.startsWith('ohy'));
    const isEes = nameLower.split(/[\s()\-/_]+/).some(word => word.startsWith('ees'));

    if (subjectFilter === 'mat' && !isMat) return false;
    if (subjectFilter === 'phy' && !isPhy) return false;
    if (subjectFilter === 'ees' && !isEes) return false;
    if (subjectFilter === 'others' && (isMat || isPhy || isEes)) return false;
    return true;
  });

  return (
    <Layout title="Attendance">
      <div className="space-y-stack-lg">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-background mb-2">Course Attendance</h1>
            <p className="text-body-md font-body-md text-on-surface-variant font-sans">Monitor your academic engagement and maintain the 80% threshold.</p>
          </div>
          <div className="flex flex-wrap gap-2.5 items-center w-full md:w-auto">
            {/* View Mode Toggle */}
            <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant/30 flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setViewMode('subjects')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  viewMode === 'subjects' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => setViewMode('worksheet')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  viewMode === 'worksheet' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Weekly Worksheet
              </button>
              <button
                type="button"
                onClick={() => setViewMode('analytics')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'analytics' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">analytics</span>
                Marks & Attendance Analytics
              </button>
            </div>

            {/* Timetable Button */}
            <button
              type="button"
              onClick={() => {
                fetchTimetable();
                setShowTimetableModal(true);
              }}
              className="px-4 py-2 bg-surface-bright border border-outline-variant rounded-full flex items-center shadow-sm hover:bg-surface-container transition-all"
            >
              <span className="material-symbols-outlined mr-2 text-primary" style={{ fontSize: '18px' }}>table_chart</span>
              <span className="font-label-sm text-label-sm font-semibold text-primary">Timetable</span>
            </button>

            {/* Add Subject Button */}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-full flex items-center shadow-sm hover:shadow-md hover:opacity-95 transition-all"
            >
              <span className="material-symbols-outlined mr-1.5" style={{ fontSize: '18px' }}>add</span>
              <span className="font-label-sm text-label-sm font-semibold">Add Subject</span>
            </button>
          </div>
        </div>

        {viewMode === 'subjects' ? (
          <div className="space-y-stack-lg">
            {/* Search & Filter Bar */}
        <div className="bg-white rounded-xl border border-outline-variant p-6 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {(['all', 'mat', 'phy', 'ees', 'others'] as const).map((cat) => {
              const labelMap: Record<string, string> = {
                all: 'All Courses',
                mat: 'MAT (Maths)',
                phy: 'PHY (Physics)',
                ees: 'EES (Electronic & Embedded Systems)',
                others: 'Others'
              };
              return (
                <button
                  key={cat}
                  onClick={() => setSubjectFilter(cat)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                    subjectFilter === cat
                      ? 'bg-primary text-on-primary border-primary shadow-sm'
                      : 'bg-surface-bright text-on-surface-variant border-outline-variant hover:border-primary/50'
                  }`}
                >
                  {labelMap[cat]}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-grow sm:flex-grow-0">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant" style={{ fontSize: '18px' }}>search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2.5 bg-[#f8f9ff] border border-outline-variant rounded-lg text-xs focus:ring-2 focus:ring-primary focus:outline-none w-full sm:w-48"
                placeholder="Search subjects..."
              />
            </div>
            
            {/* Date Filters */}
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="bg-[#f8f9ff] border border-outline-variant rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                placeholder="From Date"
                title="Start Date"
              />
              <span className="text-outline text-xs font-bold">to</span>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="bg-[#f8f9ff] border border-outline-variant rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                placeholder="To Date"
                title="End Date"
              />
              {(startDateFilter || endDateFilter || searchQuery || subjectFilter !== 'all') && (
                <button
                  onClick={() => {
                    setStartDateFilter('');
                    setEndDateFilter('');
                    setSearchQuery('');
                    setSubjectFilter('all');
                  }}
                  className="text-outline hover:text-error hover:bg-error-container/20 p-2 rounded transition-colors"
                  title="Clear Filters"
                >
                  <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Log Form Dashboard */}
        <div className="bg-white rounded-xl border border-outline-variant p-6 shadow-sm">
          <h3 className="text-stat-value font-semibold text-on-background mb-4 border-l-4 border-primary pl-3">Quick Attendance Logger</h3>
          <form onSubmit={handleQuickLog} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1">Select Subject</label>
              <select
                value={logSubName}
                onChange={(e) => setLogSubName(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                required
              >
                <option value="">-- Choose Course --</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1">Select Status</label>
              <select
                value={logStatus}
                onChange={(e) => setLogStatus(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="present">Present</option>
                <option value="absent">Not Present (Absent)</option>
                <option value="medical">Medical (Excused)</option>
                <option value="cancelled">Lecture Cancelled</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1">Date</label>
              <input
                type="date"
                value={logDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                required
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-outline uppercase tracking-wider mb-1">Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Missed train, practical log..."
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full bg-secondary text-white py-3 rounded-lg text-label-sm font-semibold hover:opacity-95 transition-all shadow-sm active:scale-95 duration-100"
              >
                Save Record
              </button>
            </div>
          </form>
        </div>

        {/* Bento Grid Layout for Courses */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {subjects.length === 0 ? (
            <div className="col-span-full text-center py-12 text-on-surface-variant bg-white border border-outline-variant/60 rounded-xl shadow-sm">
              <span className="material-symbols-outlined text-outline" style={{ fontSize: '48px' }}>school</span>
              <p className="text-body-md font-semibold mt-2">No subjects configured yet.</p>
              <p className="text-xs text-outline mt-1">Timetable classes will auto-preload once you mark them, or add custom subjects above!</p>
            </div>
          ) : filteredSubjects.length === 0 ? (
            <div className="col-span-full text-center py-12 text-on-surface-variant bg-white border border-outline-variant/60 rounded-xl shadow-sm">
              <span className="material-symbols-outlined text-outline" style={{ fontSize: '48px' }}>filter_alt_off</span>
              <p className="text-body-md font-semibold mt-2">No subjects match your active filters.</p>
              <p className="text-xs text-outline mt-1">Try clearing your filters or search keywords.</p>
            </div>
          ) : (
            filteredSubjects.map((sub) => {
              const statusColors: Record<string, string> = {
                SAFE: 'bg-secondary',
                CAUTION: 'bg-tertiary',
                CRITICAL: 'bg-error',
                EXEMPT: 'bg-outline-variant'
              };
              const statusTextColors: Record<string, string> = {
                SAFE: 'text-secondary bg-secondary/10',
                CAUTION: 'text-tertiary bg-tertiary/10',
                CRITICAL: 'text-error bg-error-container/30 border border-error/20',
                EXEMPT: 'text-outline bg-surface-container'
              };
              const barColor = statusColors[sub.safetyStatus] || 'bg-outline';
              const badgeStyle = statusTextColors[sub.safetyStatus] || 'text-outline bg-surface-container';

              return (
                <div 
                  key={sub.id} 
                  onClick={() => {
                    setSelectedSubject(sub);
                    setModalLogDate(new Date().toISOString().split('T')[0]);
                    setModalLogStatus('present');
                    setModalLogNotes('');
                  }}
                  className="bg-white rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-all p-6 flex flex-col relative overflow-hidden cursor-pointer hover:border-primary/80 active:scale-[0.99] duration-150"
                >
                  <div className={`absolute top-0 left-0 w-1 h-full ${barColor}`}></div>
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-headline-md font-headline-md font-bold text-on-background line-clamp-1">{sub.name}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                          Priority: {sub.priority}
                        </span>
                        <span className="bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                          Effort: {sub.effort_needed}
                        </span>
                        <span className="bg-primary-container/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold">
                          Grade: {sub.projected_grade}
                        </span>
                        <span className="bg-secondary-container/30 text-secondary border border-secondary/20 px-2 py-0.5 rounded text-[10px] font-bold">
                          Marks: {sub.current_marks !== undefined ? sub.current_marks : 0}%
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeStyle}`}>
                          {sub.safetyStatus}
                        </span>
                      </div>
                    </div>

                    <div className="relative w-16 h-16 flex-shrink-0">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path className="text-surface-variant" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3"></path>
                        <path className={`${sub.percentage >= sub.attendance_target ? 'text-secondary' : 'text-error'}`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${sub.percentage}, 100`} strokeLinecap="round" strokeWidth="3"></path>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-data-tabular font-data-tabular font-bold ${
                          sub.percentage >= sub.attendance_target ? 'text-secondary' : 'text-error'
                        }`}>{sub.percentage}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-outline-variant/50 flex flex-col gap-1.5 text-xs text-on-surface-variant">
                    <div className="grid grid-cols-2 gap-y-1 gap-x-2 font-medium">
                      <div>Present: <strong className="text-on-surface">{sub.present_count}</strong></div>
                      <div>Absent: <strong className="text-on-surface">{sub.absent_count}</strong></div>
                      <div>Medical: <strong className="text-on-surface">{sub.medical_count}</strong></div>
                      <div>Cancelled: <strong className="text-on-surface">{sub.cancelled_count || 0}</strong></div>
                    </div>
                    <p className={`flex items-center font-medium mt-1 ${
                      sub.safetyStatus === 'CRITICAL' ? 'text-error' : sub.safetyStatus === 'CAUTION' ? 'text-tertiary' : 'text-secondary'
                    }`}>
                      <span className="material-symbols-outlined text-sm mr-1">
                        {sub.safetyStatus === 'CRITICAL' ? 'warning' : sub.safetyStatus === 'CAUTION' ? 'info' : 'check_circle'}
                      </span>
                      {sub.message}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
          </div>
        ) : null}

        {viewMode === 'worksheet' && (
          <div className="bg-white rounded-xl border border-outline-variant p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pb-4 border-b border-outline-variant/50">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const prev = new Date(weekStartDate);
                    prev.setDate(prev.getDate() - 7);
                    setWeekStartDate(prev.toISOString().split('T')[0]);
                  }}
                  className="p-2 border border-outline-variant rounded-lg transition-colors hover:bg-surface-container"
                  title="Previous Week"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back_ios</span>
                </button>
                <span className="text-body-md font-bold text-on-background min-w-[200px] text-center">
                  Week of {new Date(weekStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(getFridayOfCurrentWeek(weekStartDate)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(weekStartDate);
                    next.setDate(next.getDate() + 7);
                    setWeekStartDate(next.toISOString().split('T')[0]);
                  }}
                  className="p-2 border border-outline-variant rounded-lg transition-colors hover:bg-surface-container"
                  title="Next Week"
                >
                  <span className="material-symbols-outlined text-sm">arrow_forward_ios</span>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWeekStartDate(getMondayOfCurrentWeek());
                  }}
                  className="px-4 py-2 border border-outline-variant rounded-full text-xs font-bold hover:bg-surface-container transition-all"
                >
                  This Week
                </button>
              </div>
            </div>

            {schedule.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant">
                <span className="material-symbols-outlined text-outline" style={{ fontSize: '48px' }}>calendar_view_week</span>
                <p className="text-body-md font-semibold mt-2">No timetable classes scheduled for this week.</p>
                <p className="text-xs text-outline mt-1 font-sans">Import your weekly schedule CSV using the Timetable button in the top header!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group schedule slots by Day of Week */}
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => {
                  const daySlots = schedule.filter(s => s.dayOfWeek === day);
                  if (daySlots.length === 0) return null;

                  const slotDate = daySlots[0]?.date;
                  const formattedDate = slotDate 
                    ? new Date(slotDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                    : day;

                  return (
                    <div key={day} className="space-y-3">
                      <h4 className="text-xs font-bold text-outline uppercase tracking-wider border-b border-outline-variant/30 pb-1.5">{formattedDate}</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {daySlots.map((item, idx) => {
                          const status = item.log?.status || 'unmarked';
                          return (
                            <div key={`${item.date}_${item.timeSlot}_${idx}`} className="bg-surface-bright border border-outline-variant/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="flex items-start gap-3">
                                <div className="p-2.5 bg-primary-container/10 text-primary rounded-lg flex items-center justify-center">
                                  <span className="material-symbols-outlined text-md">schedule</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-outline">{item.timeSlot}</span>
                                    {item.location && (
                                      <span className="bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded text-[10px] font-bold">
                                        @{item.location}
                                      </span>
                                    )}
                                  </div>
                                  <h5 className="text-sm font-bold text-on-background mt-0.5">{item.subjectName}</h5>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-3">
                                {/* Notes input */}
                                <div className="flex items-center gap-1.5 w-full md:w-auto">
                                  <span className="material-symbols-outlined text-[16px] text-outline">notes</span>
                                  <input
                                    type="text"
                                    placeholder="Add notes..."
                                    defaultValue={item.log?.notes || ''}
                                    onBlur={(e) => {
                                      if (e.target.value !== (item.log?.notes || '')) {
                                        handleSaveScheduleNotes(item, e.target.value);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    className="bg-white border border-outline-variant/80 rounded px-2.5 py-1 text-xs w-full md:w-40 focus:ring-2 focus:ring-primary focus:outline-none placeholder:text-outline-variant"
                                  />
                                </div>

                                {/* Status buttons grid */}
                                <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30">
                                  {[
                                    { key: 'present', label: 'Present', style: 'bg-secondary text-white shadow-sm' },
                                    { key: 'absent', label: 'Absent', style: 'bg-error text-white shadow-sm' },
                                    { key: 'medical', label: 'Medical', style: 'bg-[#5148d7] text-white shadow-sm' },
                                    { key: 'cancelled', label: 'Cancelled', style: 'bg-outline text-white shadow-sm' },
                                    { key: 'unmarked', label: 'Unmarked', style: 'bg-white text-on-surface font-semibold shadow-sm' }
                                  ].map(btn => (
                                    <button
                                      key={btn.key}
                                      onClick={() => handleToggleAttendance(item, btn.key)}
                                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                                        status === btn.key 
                                          ? btn.style 
                                          : 'text-on-surface-variant hover:text-on-surface'
                                      }`}
                                    >
                                      {btn.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Detailed History Section */}
        <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
            <h3 className="text-headline-md font-headline-md text-on-background font-bold">Recent Lecture History</h3>
            <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant/30">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-1 rounded-full text-label-sm font-semibold transition-all ${
                  activeTab === 'all' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All Lectures
              </button>
              <button
                onClick={() => setActiveTab('absences')}
                className={`px-4 py-1 rounded-full text-label-sm font-semibold transition-all ${
                  activeTab === 'absences' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Absences Only
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-xs text-outline uppercase tracking-wider">
                  <th className="p-4 font-bold">Date</th>
                  <th className="p-4 font-bold">Subject</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold">Notes</th>
                  <th className="p-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-data-tabular font-data-tabular text-on-background divide-y divide-outline-variant/50">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-on-surface-variant font-medium">No logs matched this view filter.</td>
                  </tr>
                ) : (
                  filteredHistory.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-bright transition-colors">
                      <td className="p-4">{new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="p-4 font-semibold">{log.subject_name}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase ${
                          log.status === 'present' 
                            ? 'text-secondary bg-secondary/10' 
                            : log.status === 'medical'
                            ? 'text-[#5148d7] bg-[#c3c0ff]/20'
                            : log.status === 'cancelled'
                            ? 'text-outline bg-outline/10'
                            : 'text-error bg-error-container/30'
                        }`}>
                          <span className="material-symbols-outlined text-[14px] mr-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {log.status === 'present' ? 'check' : log.status === 'medical' ? 'medical_services' : log.status === 'cancelled' ? 'event_busy' : 'close'}
                          </span>
                          {log.status === 'present' ? 'Present' : log.status === 'medical' ? 'Medical' : log.status === 'cancelled' ? 'Cancelled' : 'Absent'}
                        </span>
                      </td>
                      <td className="p-4 text-on-surface-variant italic truncate max-w-xs">{log.notes || '—'}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="text-outline hover:text-error transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

        {/* ========================================================================= */}
        {/* View Mode 3: Marks & Attendance Smart Analytics */}
        {/* ========================================================================= */}
        {viewMode === 'analytics' && (
          <div className="space-y-stack-md">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {/* Overall Semester Attendance Health */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-primary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Overall Attendance</span>
                    <span className="material-symbols-outlined">donut_large</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {academicStats.overallAttendancePct}%
                  </div>
                </div>
                <div className="mt-3 text-xs font-medium">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    academicStats.overallAttendancePct >= 80 ? 'bg-secondary/15 text-secondary' : 'bg-error-container text-on-error-container'
                  }`}>
                    {academicStats.overallAttendancePct >= 80 ? 'Safe (≥ 80% Benchmark Met)' : 'Critical Debarment Risk (< 80%)'}
                  </span>
                </div>
              </div>

              {/* Continuous Assessment / Average Marks */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-secondary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Avg Assessment Marks</span>
                    <span className="material-symbols-outlined">grade</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {academicStats.avgMarks}%
                  </div>
                </div>
                <div className="mt-3 text-xs font-medium">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    academicStats.avgMarks >= 70 ? 'bg-secondary/15 text-secondary' : 'bg-primary/10 text-primary'
                  }`}>
                    {academicStats.avgMarks >= 70 ? 'Distinction Average' : 'Passing Grade Range'}
                  </span>
                </div>
              </div>

              {/* Projected Semester GPA */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-tertiary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Projected GPA</span>
                    <span className="material-symbols-outlined">school</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold text-on-background font-data-tabular">
                    {academicStats.projectedGPA} <span className="text-sm font-semibold text-outline">/ 4.00</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-outline font-medium">
                  Based on target grades across {subjects.length} courses
                </div>
              </div>

              {/* At-Risk Modules Count */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-error mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Modules At Risk</span>
                    <span className="material-symbols-outlined">warning</span>
                  </div>
                  <div className="text-display-lg-mobile font-display-lg-mobile font-bold font-data-tabular text-error">
                    {academicStats.criticalCount} <span className="text-sm font-semibold text-outline">Subjects</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-outline font-medium">
                  {academicStats.criticalCount === 0 ? 'All courses on track 🎉' : 'Attendance < 80% or Marks < 50%'}
                </div>
              </div>
            </div>

            {/* Smart Academic Observations */}
            <div className="bg-gradient-to-r from-primary-container/10 via-surface-container-low to-secondary-container/10 border border-primary/20 rounded-xl p-6 shadow-sm">
              <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary">psychology</span>
                Academic Performance & Debarment Forecast
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {academicStats.insights.map((insight, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-outline-variant/30 shadow-xs text-xs text-on-surface font-medium leading-relaxed">
                    {insight}
                  </div>
                ))}
              </div>
            </div>

            {/* Attendance vs Marks Risk Matrix (Quadrant Analysis) */}
            <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-3 border-b border-outline-variant/40">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background border-l-4 border-primary pl-3">
                    Attendance vs Marks Risk Matrix
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">Quadrant mapping of academic score versus mandatory attendance compliance</p>
                </div>
                <span className="text-xs text-outline font-medium">Click any course to edit marks/grade</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Quadrant 1: Excelling */}
                <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-secondary uppercase flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">verified</span>
                      Dean's List / Excelling
                    </span>
                    <span className="text-xs font-bold text-secondary font-data-tabular">
                      {academicStats.quadrants.excelling.length} Course(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-outline">High Attendance (≥80%) and High Marks (≥70%)</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {academicStats.quadrants.excelling.length === 0 ? (
                      <span className="text-xs text-outline italic">None currently</span>
                    ) : (
                      academicStats.quadrants.excelling.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleOpenMarksModal(s)}
                          className="px-3 py-1.5 bg-white border border-secondary/30 rounded-lg text-xs font-bold text-on-surface hover:border-secondary hover:shadow-xs transition-all flex items-center gap-2"
                        >
                          <span>{s.name}</span>
                          <span className="text-secondary font-data-tabular">{s.current_marks || 0}% ({s.projected_grade})</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Quadrant 2: Debarment Risk */}
                <div className="bg-tertiary-fixed/30 border border-tertiary/30 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-tertiary uppercase flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">notification_important</span>
                      Debarment Risk (High Marks, Low Attendance)
                    </span>
                    <span className="text-xs font-bold text-tertiary font-data-tabular">
                      {academicStats.quadrants.attendanceRisk.length} Course(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-outline">High Marks (≥70%) but Sub-80% Attendance Threshold!</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {academicStats.quadrants.attendanceRisk.length === 0 ? (
                      <span className="text-xs text-outline italic">None currently</span>
                    ) : (
                      academicStats.quadrants.attendanceRisk.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleOpenMarksModal(s)}
                          className="px-3 py-1.5 bg-white border border-tertiary/40 rounded-lg text-xs font-bold text-on-surface hover:border-tertiary hover:shadow-xs transition-all flex items-center gap-2"
                        >
                          <span>{s.name}</span>
                          <span className="text-error font-data-tabular">{s.percentage}% att.</span>
                          <span className="text-secondary font-data-tabular font-bold">{s.current_marks || 0}%</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Quadrant 3: Academic Support Needed */}
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary uppercase flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">menu_book</span>
                      Academic Support Needed
                    </span>
                    <span className="text-xs font-bold text-primary font-data-tabular">
                      {academicStats.quadrants.supportNeeded.length} Course(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-outline">Good Attendance (≥80%) but Lower Assessment Marks (&lt;70%)</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {academicStats.quadrants.supportNeeded.length === 0 ? (
                      <span className="text-xs text-outline italic">None currently</span>
                    ) : (
                      academicStats.quadrants.supportNeeded.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleOpenMarksModal(s)}
                          className="px-3 py-1.5 bg-white border border-primary/30 rounded-lg text-xs font-bold text-on-surface hover:border-primary hover:shadow-xs transition-all flex items-center gap-2"
                        >
                          <span>{s.name}</span>
                          <span className="text-primary font-data-tabular">{s.current_marks || 0}%</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Quadrant 4: Critical Priority */}
                <div className="bg-error-container/40 border border-error/30 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-error uppercase flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">report_problem</span>
                      Critical Intervention Required
                    </span>
                    <span className="text-xs font-bold text-error font-data-tabular">
                      {academicStats.quadrants.critical.length} Course(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-outline">Both Attendance (&lt;80%) and Marks (&lt;60%) Below Targets</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {academicStats.quadrants.critical.length === 0 ? (
                      <span className="text-xs text-outline italic">None currently</span>
                    ) : (
                      academicStats.quadrants.critical.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleOpenMarksModal(s)}
                          className="px-3 py-1.5 bg-white border border-error/40 rounded-lg text-xs font-bold text-on-surface hover:border-error hover:shadow-xs transition-all flex items-center gap-2"
                        >
                          <span>{s.name}</span>
                          <span className="text-error font-data-tabular font-bold">{s.percentage}% att.</span>
                          <span className="text-error font-data-tabular font-bold">{s.current_marks || 0}%</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Subject Marks & Attendance Detailed Table */}
            <div className="bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-outline-variant flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <h3 className="text-headline-md font-bold text-on-background">
                    Course Marks & Attendance Breakdown
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">Overview of continuous assessment marks, safety runway, and grade targets</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(academicStats.gradeDistribution).map(([grade, count]) => (
                    <span key={grade} className="px-2.5 py-1 bg-surface-container rounded-lg text-xs font-bold font-data-tabular text-primary">
                      {grade}: {count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-bright text-xs text-outline border-b border-outline-variant uppercase tracking-wider">
                      <th className="p-4 font-bold">Course Subject</th>
                      <th className="p-4 font-bold">Priority / Effort</th>
                      <th className="p-4 font-bold">Attendance %</th>
                      <th className="p-4 font-bold">Runway / Debarment Status</th>
                      <th className="p-4 font-bold">Current Marks (%)</th>
                      <th className="p-4 font-bold">Target Grade</th>
                      <th className="p-4 font-bold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-outline-variant/40">
                    {subjects.map(s => {
                      const marks = s.current_marks !== undefined ? s.current_marks : 0;
                      return (
                        <tr key={s.id} className="hover:bg-surface-bright transition-colors">
                          <td className="p-4 font-bold text-on-background">
                            {s.name}
                          </td>
                          <td className="p-4">
                            <span className="text-[11px] font-semibold text-outline">
                              {s.priority} / {s.effort_needed}
                            </span>
                          </td>
                          <td className="p-4 font-data-tabular">
                            <span className={`font-bold ${s.percentage >= (s.attendance_target || 80) ? 'text-secondary' : 'text-error'}`}>
                              {s.percentage}%
                            </span>
                            <span className="text-xs text-outline"> / {s.attendance_target}%</span>
                          </td>
                          <td className="p-4 text-xs font-medium">
                            <span className={`flex items-center gap-1 ${
                              s.safetyStatus === 'CRITICAL' ? 'text-error' : s.safetyStatus === 'CAUTION' ? 'text-tertiary' : 'text-secondary'
                            }`}>
                              <span className="material-symbols-outlined text-sm">
                                {s.safetyStatus === 'CRITICAL' ? 'warning' : s.safetyStatus === 'CAUTION' ? 'info' : 'check_circle'}
                              </span>
                              {s.message}
                            </span>
                          </td>
                          <td className="p-4 font-data-tabular min-w-[150px]">
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs font-bold">
                                <span className={marks >= 70 ? 'text-secondary' : marks >= 50 ? 'text-primary' : 'text-error'}>
                                  {marks}%
                                </span>
                              </div>
                              <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    marks >= 70 ? 'bg-secondary' : marks >= 50 ? 'bg-primary' : 'bg-error'
                                  }`}
                                  style={{ width: `${Math.min(100, marks)}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 font-data-tabular">
                            <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-xs font-bold">
                              {s.projected_grade}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenMarksModal(s)}
                              className="px-3 py-1.5 bg-surface-container text-primary hover:bg-primary hover:text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                            >
                              Update Marks
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      {/* Add Subject Modal Dialog */}
      {showModal && (
        <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>
            
            <div className="p-6 border-b border-outline-variant">
              <div className="flex justify-between items-center">
                <h3 className="text-stat-value font-bold text-primary">Add Course Subject</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-outline hover:text-on-surface"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleAddSubject} className="p-6 space-y-4">
              {error && <div className="p-3 bg-error-container text-on-error-container text-xs rounded font-medium">{error}</div>}

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Subject Name</label>
                <input
                  type="text"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="e.g. Real Analysis"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Priority Level</label>
                  <select
                    value={newSubPriority}
                    onChange={(e) => setNewSubPriority(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Effort Needed</label>
                  <select
                    value={newSubEffort}
                    onChange={(e) => setNewSubEffort(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Projected Grade Target</label>
                  <input
                    type="text"
                    value={newSubGrade}
                    onChange={(e) => setNewSubGrade(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder="e.g. A+"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Current Marks (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newSubMarks}
                    onChange={(e) => setNewSubMarks(Number(e.target.value))}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none font-bold"
                    placeholder="e.g. 85"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSubTargetRequired}
                    onChange={(e) => setNewSubTargetRequired(e.target.checked)}
                    className="w-5 h-5 border-outline-variant rounded text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-on-surface-variant uppercase">80% Target Required</span>
                </label>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:opacity-95"
                >
                  Add Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subject Detail & History Modal */}
      {selectedSubject && (
        <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative my-8">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>
            
            {/* Modal Header */}
            <div className="p-6 border-b border-outline-variant bg-surface-bright flex justify-between items-center">
              <div>
                <h3 className="text-headline-md font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">school</span>
                  {selectedSubject.name}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 font-medium">Detailed Attendance Logs and Performance Metrics</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteSubject(selectedSubject.id)}
                  className="text-outline hover:text-error p-1.5 rounded-full hover:bg-error-container/20 transition-colors"
                  title="Delete Course Subject"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubject(null);
                    setEditingLogId(null);
                  }}
                  className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              {/* Stats and Safety Alert */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/60 flex items-center gap-4">
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path className="text-surface-variant" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3"></path>
                      <path className={`${selectedSubject.percentage >= selectedSubject.attendance_target ? 'text-secondary' : 'text-error'}`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${selectedSubject.percentage}, 100`} strokeLinecap="round" strokeWidth="3"></path>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-on-background">{selectedSubject.percentage}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-outline font-bold uppercase tracking-wider">Attendance</p>
                    <p className="text-sm font-bold text-on-surface">Target: {selectedSubject.attendance_target}%</p>
                  </div>
                </div>

                <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/60">
                  <p className="text-xs text-outline font-bold uppercase tracking-wider mb-2">Metrics Summary</p>
                  <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-xs text-on-surface-variant font-medium">
                    <div>Present: <strong className="text-on-surface">{selectedSubject.present_count}</strong></div>
                    <div>Absent: <strong className="text-on-surface">{selectedSubject.absent_count}</strong></div>
                    <div>Medical: <strong className="text-on-surface">{selectedSubject.medical_count}</strong></div>
                    <div>Cancelled: <strong className="text-on-surface">{selectedSubject.cancelled_count || 0}</strong></div>
                  </div>
                </div>

                <div className={`rounded-xl p-4 border flex items-center gap-3 ${
                  selectedSubject.safetyStatus === 'CRITICAL' 
                    ? 'bg-error-container/30 border-error/20 text-error' 
                    : selectedSubject.safetyStatus === 'CAUTION' 
                    ? 'bg-tertiary/10 border-tertiary/20 text-tertiary' 
                    : 'bg-secondary/10 border-secondary/20 text-secondary'
                }`}>
                  <span className="material-symbols-outlined">
                    {selectedSubject.safetyStatus === 'CRITICAL' ? 'warning' : selectedSubject.safetyStatus === 'CAUTION' ? 'info' : 'check_circle'}
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">Status: {selectedSubject.safetyStatus}</p>
                    <p className="text-xs font-medium mt-0.5">{selectedSubject.message}</p>
                  </div>
                </div>
              </div>

              {/* Log new attendance form for this subject */}
              <div className="bg-[#f8f9ff] rounded-xl border border-outline-variant/80 p-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">Log Attendance for this Course</h4>
                <form onSubmit={handleAddModalLog} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Status</label>
                    <select
                      value={modalLogStatus}
                      onChange={(e) => setModalLogStatus(e.target.value)}
                      className="w-full bg-white border border-outline-variant rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="medical">Medical</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Date</label>
                    <input
                      type="date"
                      value={modalLogDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setModalLogDate(e.target.value)}
                      className="w-full bg-white border border-outline-variant rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                      required
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Missed train, midterm day..."
                      value={modalLogNotes}
                      onChange={(e) => setModalLogNotes(e.target.value)}
                      className="w-full bg-white border border-outline-variant rounded-lg p-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full bg-primary text-white py-2 rounded-lg text-xs font-semibold hover:opacity-95 transition-all shadow-sm"
                    >
                      Log
                    </button>
                  </div>
                </form>
              </div>

              {/* Subject Attendance History List */}
              <div>
                <h4 className="text-xs font-bold text-outline uppercase tracking-wider mb-3">Logs & Lecture History</h4>
                <div className="border border-outline-variant/60 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant bg-surface-container-low text-[10px] text-outline uppercase tracking-wider">
                        <th className="p-3 font-bold">Date</th>
                        <th className="p-3 font-bold">Status</th>
                        <th className="p-3 font-bold">Notes</th>
                        <th className="p-3 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-outline-variant/50">
                      {history.filter(log => log.subject_name.toLowerCase() === selectedSubject.name.toLowerCase()).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-on-surface-variant font-medium">No logged attendance history found for this course.</td>
                        </tr>
                      ) : (
                        history
                          .filter(log => log.subject_name.toLowerCase() === selectedSubject.name.toLowerCase())
                          .map((log) => {
                            const isEditing = editingLogId === log.id;
                            return (
                              <tr key={log.id} className="hover:bg-surface-bright transition-colors">
                                <td className="p-3">
                                  {isEditing ? (
                                    <input
                                      type="date"
                                      value={editLogDate}
                                      max={new Date().toISOString().split('T')[0]}
                                      onChange={(e) => setEditLogDate(e.target.value)}
                                      className="border border-outline-variant rounded p-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                  ) : (
                                    new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                  )}
                                </td>
                                <td className="p-3">
                                  {isEditing ? (
                                    <select
                                      value={editLogStatus}
                                      onChange={(e) => setEditLogStatus(e.target.value)}
                                      className="border border-outline-variant rounded p-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                      <option value="present">Present</option>
                                      <option value="absent">Absent</option>
                                      <option value="medical">Medical</option>
                                      <option value="cancelled">Cancelled</option>
                                    </select>
                                  ) : (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      log.status === 'present' 
                                        ? 'text-secondary bg-secondary/10' 
                                        : log.status === 'medical'
                                        ? 'text-[#5148d7] bg-[#c3c0ff]/20'
                                        : log.status === 'cancelled'
                                        ? 'text-outline bg-outline/10'
                                        : 'text-error bg-error-container/30'
                                    }`}>
                                      {log.status === 'present' ? 'Present' : log.status === 'medical' ? 'Medical' : log.status === 'cancelled' ? 'Cancelled' : 'Absent'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={editLogNotes}
                                      onChange={(e) => setEditLogNotes(e.target.value)}
                                      className="border border-outline-variant rounded p-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                  ) : (
                                    <span className="text-on-surface-variant italic">{log.notes || '—'}</span>
                                  )}
                                </td>
                                <td className="p-3 text-right">
                                  {isEditing ? (
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => handleUpdateLog(log.id)}
                                        className="text-secondary hover:bg-secondary/10 p-1 rounded"
                                        title="Save"
                                      >
                                        <span className="material-symbols-outlined text-lg">check</span>
                                      </button>
                                      <button
                                        onClick={() => setEditingLogId(null)}
                                        className="text-outline hover:bg-surface-container p-1 rounded"
                                        title="Cancel"
                                      >
                                        <span className="material-symbols-outlined text-lg">close</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => {
                                          setEditingLogId(log.id);
                                          setEditLogDate(log.date);
                                          setEditLogStatus(log.status);
                                          setEditLogNotes(log.notes || '');
                                        }}
                                        className="text-outline hover:text-primary p-1 rounded"
                                        title="Edit Log"
                                      >
                                        <span className="material-symbols-outlined text-lg">edit</span>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteLog(log.id)}
                                        className="text-outline hover:text-error p-1 rounded"
                                        title="Delete Log"
                                      >
                                        <span className="material-symbols-outlined text-lg">delete</span>
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-outline-variant/60 bg-surface-bright flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedSubject(null);
                  setEditingLogId(null);
                }}
                className="px-5 py-2.5 bg-surface border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface-container font-semibold"
              >
                Close View
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Timetable Modal Dialog */}
      {showTimetableModal && (
        <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>
            
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
              <div>
                <h3 className="text-headline-md font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">table_chart</span>
                  Weekly Class Timetable
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 font-medium font-sans">Import or review your schedule to enable one-click weekly attendance worksheets.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTimetableModal(false)}
                className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
              
              {/* CSV Upload Form */}
              <div className="bg-[#f8f9ff] rounded-xl border border-outline-variant p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-left">
                  <p className="text-xs font-bold text-on-surface">Import Class Schedule via CSV</p>
                  <p className="text-[10px] text-outline font-medium mt-0.5 font-sans">CSV Format: Time,Monday,Tuesday,Wednesday,Thursday,Friday</p>
                </div>
                <label className="bg-secondary text-white px-5 py-2 rounded-full cursor-pointer shadow-sm hover:opacity-95 text-xs font-semibold flex items-center gap-2 transition-all">
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  Choose Timetable CSV
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleImportCSV}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Timetable Grid View */}
              {timetableSlots.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant border border-dashed border-outline-variant/80 rounded-xl">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: '48px' }}>calendar_today</span>
                  <p className="text-body-md font-semibold mt-2">No timetable slots logged.</p>
                  <p className="text-xs text-outline mt-1 font-sans">Use the button above to import your weekly schedule CSV file.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-outline-variant/60 rounded-xl shadow-sm">
                  <table className="w-full text-center border-collapse table-fixed">
                    <thead>
                      <tr className="border-b border-outline-variant bg-surface-container-low text-xs text-outline uppercase tracking-wider">
                        <th className="p-3 font-bold border-r border-outline-variant w-32">Time</th>
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => (
                          <th key={day} className="p-3 font-bold border-r border-outline-variant">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-outline-variant/50 text-on-background">
                      {(() => {
                        const getMinutes = (slotStr: string) => {
                          const match = slotStr.match(/(\d+)\.(\d+)/);
                          if (!match) return 0;
                          const hour = parseInt(match[1]);
                          const minute = parseInt(match[2]);
                          const adjustedHour = hour <= 5 ? hour + 12 : hour;
                          return adjustedHour * 60 + minute;
                        };
                        const sortedTimeSlots = Array.from(new Set(timetableSlots.map(s => s.time_slot))).sort((a, b) => getMinutes(a) - getMinutes(b));

                        return sortedTimeSlots.map(slot => (
                          <tr key={slot} className="hover:bg-surface-bright transition-colors border-b border-outline-variant/30 animate-fade-in">
                            <td className="p-3 font-bold bg-surface-bright border-r border-outline-variant/60">{slot}</td>
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => {
                              const matchSlot = timetableSlots.find(s => s.day_of_week === day && s.time_slot === slot);
                              return (
                                <td key={`${day}_${slot}`} className="p-3 border-r border-outline-variant/60 align-middle">
                                  {matchSlot ? (
                                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 text-left">
                                      <p className="font-bold text-primary truncate" title={matchSlot.subject_name}>{matchSlot.subject_name}</p>
                                      {matchSlot.location && (
                                        <p className="text-[10px] text-outline font-medium mt-0.5 truncate flex items-center">
                                          <span className="material-symbols-outlined text-[12px] mr-1">location_on</span>
                                          {matchSlot.location}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-outline-variant">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}

            </div>

            <div className="p-6 border-t border-outline-variant/60 bg-surface-bright flex justify-end">
              <button
                type="button"
                onClick={() => setShowTimetableModal(false)}
                className="px-5 py-2.5 bg-surface border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface-container font-semibold"
              >
                Close Timetable
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Quick Edit Marks & Target Grade Modal */}
      {marksModalOpen && targetSubToEdit && (
        <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-secondary"></div>
            <div className="p-6 border-b border-outline-variant bg-surface-bright flex justify-between items-center">
              <div>
                <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">edit_note</span>
                  Update Marks & Target Grade
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5 font-medium">{targetSubToEdit.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMarksModalOpen(false);
                  setTargetSubToEdit(null);
                }}
                className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveMarksAndGrade} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Current Assessment Marks (0 - 100%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={editMarksVal}
                    onChange={(e) => setEditMarksVal(Number(e.target.value))}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-base font-bold font-data-tabular focus:ring-2 focus:ring-secondary focus:outline-none"
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-sm font-bold text-outline">%</span>
                </div>
                <p className="text-[11px] text-outline mt-1 font-sans">
                  Midterm exams, assignments, labs, or continuous assessment aggregate.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Projected Target Grade
                </label>
                <select
                  value={editGradeVal}
                  onChange={(e) => setEditGradeVal(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm font-semibold focus:ring-2 focus:ring-secondary focus:outline-none"
                >
                  <option value="A+">A+ (GPA 4.0 - Exceptional)</option>
                  <option value="A">A (GPA 4.0 - Excellent)</option>
                  <option value="A-">A- (GPA 3.7 - Very Good)</option>
                  <option value="B+">B+ (GPA 3.3 - Good)</option>
                  <option value="B">B (GPA 3.0 - Satisfactory)</option>
                  <option value="B-">B- (GPA 2.7 - Adequate)</option>
                  <option value="C+">C+ (GPA 2.3 - Pass)</option>
                  <option value="C">C (GPA 2.0 - Minimum Pass)</option>
                  <option value="F">F (GPA 0.0 - Fail)</option>
                </select>
              </div>

              <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/50 text-xs space-y-1">
                <div className="flex justify-between font-medium">
                  <span className="text-outline">Attendance Status:</span>
                  <span className={`font-bold ${targetSubToEdit.percentage >= (targetSubToEdit.attendance_target || 80) ? 'text-secondary' : 'text-error'}`}>
                    {targetSubToEdit.percentage}%
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-outline">Academic Risk Category:</span>
                  <span className="font-bold text-on-surface">
                    {targetSubToEdit.percentage >= 80 && editMarksVal >= 70 ? '🟢 Excelling' :
                     targetSubToEdit.percentage < 80 && editMarksVal >= 70 ? '🟡 Debarment Risk' :
                     targetSubToEdit.percentage >= 80 && editMarksVal < 70 ? '🟠 Marks Support Needed' :
                     '🔴 Critical Dual Risk'}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => {
                    setMarksModalOpen(false);
                    setTargetSubToEdit(null);
                  }}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface-container font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-secondary text-white rounded-lg text-sm font-semibold hover:opacity-95 shadow-sm transition-all"
                >
                  Save Marks & Grade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};
