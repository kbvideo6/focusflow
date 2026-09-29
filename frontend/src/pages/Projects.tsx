import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface Project {
  id: number;
  name: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  due_date?: string;
  priority: string;
}

interface Course {
  id: number;
  name: string;
  platform: string;
  progress_pct: number;
  hours_studied: number;
  notes?: string;
}

export const Projects: React.FC = () => {
  const { token, apiUrl } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  // Project Modals/Form states
  const [showProjModal, setShowProjModal] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projDueDate, setProjDueDate] = useState('');
  const [projPriority, setProjPriority] = useState('Medium');

  // Course Modals/Form states
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [coursePlatform, setCoursePlatform] = useState('Udemy');
  const [courseProgress, setCourseProgress] = useState(0);
  const [courseHours, setCourseHours] = useState(0.0);
  const [courseNotes, setCourseNotes] = useState('');

  const fetchData = async () => {
    if (!token) return;
    try {
      const projRes = await fetch(`${apiUrl}/tracker/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (projRes.ok) setProjects(await projRes.json());

      const courRes = await fetch(`${apiUrl}/tracker/courses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (courRes.ok) setCourses(await courRes.json());
    } catch (err) {
      console.error('Fetch projects error:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  // Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: projName.trim(),
          description: projDesc.trim(),
          status: 'todo',
          due_date: projDueDate,
          priority: projPriority
        })
      });
      if (res.ok) {
        setProjName('');
        setProjDesc('');
        setProjDueDate('');
        setShowProjModal(false);
        fetchData();
      }
    } catch (err) {
      console.error('Create project error:', err);
    }
  };

  // Move Project Column
  const handleMoveProject = async (id: number, nextStatus: 'todo' | 'in_progress' | 'done') => {
    const proj = projects.find(p => p.id === id);
    if (!proj) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...proj,
          status: nextStatus
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Move project failed:', err);
    }
  };

  // Delete Project
  const handleDeleteProject = async (id: number) => {
    if (!window.confirm('Delete this project?')) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Delete project failed:', err);
    }
  };

  // Create Course
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim()) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: courseName.trim(),
          platform: coursePlatform,
          progress_pct: courseProgress,
          hours_studied: courseHours,
          notes: courseNotes.trim()
        })
      });
      if (res.ok) {
        setCourseName('');
        setCourseNotes('');
        setCourseProgress(0);
        setCourseHours(0.0);
        setShowCourseModal(false);
        fetchData();
      }
    } catch (err) {
      console.error('Add course failed:', err);
    }
  };

  // Update Course Study stats (increment 1 hour, +5% progress)
  const handleLogStudySession = async (course: Course) => {
    try {
      const nextProgress = Math.min(100, course.progress_pct + 5);
      const nextHours = course.hours_studied + 1;
      
      const res = await fetch(`${apiUrl}/tracker/courses/${course.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...course,
          progress_pct: nextProgress,
          hours_studied: nextHours
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Study log failed:', err);
    }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!window.confirm('Delete this course tracker?')) return;
    try {
      const res = await fetch(`${apiUrl}/tracker/courses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Delete course failed:', err);
    }
  };

  return (
    <Layout title="Projects & Learning">
      <div className="space-y-stack-lg">
        {/* Header Title */}
        <div className="mb-stack-lg flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h2 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-background">Projects &amp; Learning</h2>
            <p className="text-body-md font-body-md text-outline mt-2">Manage active club initiatives and external skill acquisition.</p>
          </div>
        </div>

        {/* Bento Grid layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          
          {/* Left Side: Club Projects Kanban board (8 columns) */}
          <section className="md:col-span-8 flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-headline-md font-headline-md font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">groups</span>
                Club Initiatives Kanban
              </h3>
              <button
                onClick={() => setShowProjModal(true)}
                className="text-primary hover:text-primary-container text-label-sm font-label-sm font-bold flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span> New Project
              </button>
            </div>

            {/* Kanban Columns container */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-h-[450px]">
              
              {/* Column 1: TODO */}
              <div className="bg-[#f8f9ff] rounded-xl p-4 border border-outline-variant flex flex-col gap-3">
                <div className="flex items-center justify-between mb-2 border-b border-outline-variant pb-2">
                  <span className="text-label-sm font-label-sm text-outline uppercase font-bold tracking-wider">Todo</span>
                  <span className="bg-surface-container text-on-surface-variant text-xs px-2 py-0.5 rounded-full font-bold">
                    {projects.filter(p => p.status === 'todo').length}
                  </span>
                </div>

                {projects.filter(p => p.status === 'todo').map((proj) => (
                  <div key={proj.id} className="bg-white p-4 rounded-lg shadow-sm border border-outline-variant hover:shadow-md transition-shadow relative border-l-4 border-l-outline">
                    <h4 className="text-body-md font-bold text-on-background mb-1">{proj.name}</h4>
                    <p className="text-xs text-on-surface-variant mb-3">{proj.description}</p>
                    <div className="flex items-center justify-between text-xs mt-auto">
                      {proj.due_date ? (
                        <span className="bg-surface-container px-2 py-0.5 rounded text-[10px] text-outline font-bold">
                          Due: {new Date(proj.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        proj.priority === 'High' ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-outline'
                      }`}>{proj.priority}</span>
                    </div>
                    
                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-outline-variant/30">
                      <button onClick={() => handleDeleteProject(proj.id)} className="text-outline hover:text-error mr-auto"><span className="material-symbols-outlined text-sm">delete</span></button>
                      <button
                        onClick={() => handleMoveProject(proj.id, 'in_progress')}
                        className="text-xs font-bold text-primary hover:underline flex items-center"
                      >
                        Start <span className="material-symbols-outlined text-sm ml-0.5">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Column 2: IN PROGRESS */}
              <div className="bg-[#f8f9ff] rounded-xl p-4 border border-outline-variant flex flex-col gap-3">
                <div className="flex items-center justify-between mb-2 border-b border-outline-variant pb-2">
                  <span className="text-label-sm font-label-sm text-primary uppercase font-bold tracking-wider">In Progress</span>
                  <span className="bg-primary-container/20 text-primary text-xs px-2 py-0.5 rounded-full font-bold">
                    {projects.filter(p => p.status === 'in_progress').length}
                  </span>
                </div>

                {projects.filter(p => p.status === 'in_progress').map((proj) => (
                  <div key={proj.id} className="bg-white p-4 rounded-lg shadow-sm border border-outline-variant hover:shadow-md transition-shadow relative border-l-4 border-l-primary">
                    <h4 className="text-body-md font-bold text-on-background mb-1">{proj.name}</h4>
                    <p className="text-xs text-on-surface-variant mb-3">{proj.description}</p>
                    <div className="flex items-center justify-between text-xs mt-auto">
                      {proj.due_date ? (
                        <span className="bg-surface-container px-2 py-0.5 rounded text-[10px] text-outline font-bold">
                          Due: {new Date(proj.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        proj.priority === 'High' ? 'bg-error-container text-on-error-container font-semibold' : 'bg-surface-container text-outline'
                      }`}>{proj.priority}</span>
                    </div>

                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-outline-variant/30">
                      <button onClick={() => handleDeleteProject(proj.id)} className="text-outline hover:text-error mr-auto"><span className="material-symbols-outlined text-sm">delete</span></button>
                      <button
                        onClick={() => handleMoveProject(proj.id, 'todo')}
                        className="text-xs font-medium text-outline hover:underline"
                      >
                        Revert
                      </button>
                      <button
                        onClick={() => handleMoveProject(proj.id, 'done')}
                        className="text-xs font-bold text-secondary hover:underline flex items-center"
                      >
                        Done <span className="material-symbols-outlined text-sm ml-0.5">check_circle</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Column 3: DONE */}
              <div className="bg-[#f8f9ff] rounded-xl p-4 border border-outline-variant flex flex-col gap-3 opacity-80">
                <div className="flex items-center justify-between mb-2 border-b border-outline-variant pb-2">
                  <span className="text-label-sm font-label-sm text-secondary uppercase font-bold tracking-wider">Done</span>
                  <span className="bg-secondary-container/20 text-secondary text-xs px-2 py-0.5 rounded-full font-bold">
                    {projects.filter(p => p.status === 'done').length}
                  </span>
                </div>

                {projects.filter(p => p.status === 'done').map((proj) => (
                  <div key={proj.id} className="bg-white p-4 rounded-lg shadow-sm border border-outline-variant relative border-l-4 border-l-secondary">
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="text-body-md font-bold text-outline line-through">{proj.name}</h4>
                      <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    </div>
                    <p className="text-xs text-outline line-through mb-3">{proj.description}</p>
                    
                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-outline-variant/30">
                      <button onClick={() => handleDeleteProject(proj.id)} className="text-outline hover:text-error mr-auto"><span className="material-symbols-outlined text-sm">delete</span></button>
                      <button
                        onClick={() => handleMoveProject(proj.id, 'in_progress')}
                        className="text-xs font-medium text-outline hover:underline"
                      >
                        In Progress
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </section>

          {/* Right Side: External Courses List (4 columns) */}
          <section className="md:col-span-4 flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-headline-md font-headline-md font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">school</span>
                External Courses
              </h3>
            </div>

            <div className="flex flex-col gap-4">
              {courses.length === 0 ? (
                <div className="text-center py-6 text-on-surface-variant bg-white border border-outline-variant rounded-xl shadow-sm">
                  <p className="text-sm font-semibold">No external courses added.</p>
                </div>
              ) : (
                courses.map((course) => (
                  <div key={course.id} className="bg-white rounded-xl p-5 border border-outline-variant shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                    <div className="flex items-start justify-between mb-4 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold font-headline-md shadow-sm ${
                          course.platform === 'Udemy' ? 'bg-[#29303b]' : course.platform === 'FreeCodeCamp' ? 'bg-[#0a0a23]' : 'bg-[#4338ca]'
                        }`}>
                          {course.platform.substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-semibold text-on-background text-sm leading-tight">{course.name}</h4>
                          <p className="text-data-tabular text-xs text-outline mt-0.5">{course.platform}</p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleDeleteCourse(course.id)}
                        className="text-outline hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>

                    <div className="mb-4 relative z-10">
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-stat-value font-stat-value text-on-background text-2xl font-bold">{course.progress_pct}%</span>
                        <span className="text-label-sm font-label-sm text-outline">{course.hours_studied.toFixed(1)} hrs studied</span>
                      </div>
                      <div className="w-full bg-surface-container rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${course.progress_pct}%` }}></div>
                      </div>
                    </div>

                    {course.notes && (
                      <div className="bg-[#f8f9ff] rounded-lg p-3 mb-4 border border-outline-variant/50 relative z-10 text-xs text-on-surface-variant font-medium">
                        Focus: {course.notes}
                      </div>
                    )}

                    <button
                      onClick={() => handleLogStudySession(course)}
                      className="w-full py-2 rounded-lg border border-primary text-primary font-label-sm text-xs hover:bg-primary-container/10 transition-colors flex items-center justify-center gap-1 relative z-10"
                    >
                      <span className="material-symbols-outlined text-base">play_arrow</span> Log Study Session
                    </button>
                  </div>
                ))
              )}

              {/* Add Course button trigger */}
              <button
                onClick={() => setShowCourseModal(true)}
                className="w-full py-4 rounded-xl border-2 border-dashed border-outline-variant text-outline hover:border-primary hover:text-primary transition-colors flex flex-col items-center justify-center gap-1 bg-[#f8f9ff]/50 hover:bg-[#f8f9ff]"
              >
                <span className="material-symbols-outlined">library_add</span>
                <span className="font-label-sm text-sm font-bold">Add New Course</span>
              </button>
            </div>
          </section>

        </div>
      </div>

      {/* Modal 1: Add Project */}
      {showProjModal && (
        <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>
            
            <div className="p-6 border-b border-outline-variant">
              <div className="flex justify-between items-center">
                <h3 className="text-stat-value font-bold text-primary">New Club Project Task</h3>
                <button onClick={() => setShowProjModal(false)} className="text-outline hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
              </div>
            </div>

            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Project/Task Name</label>
                <input
                  type="text"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="e.g. Winter Hackathon Venue Setup"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Description</label>
                <textarea
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none h-20"
                  placeholder="Task details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Priority</label>
                  <select
                    value={projPriority}
                    onChange={(e) => setProjPriority(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Due Date</label>
                  <input
                    type="date"
                    value={projDueDate}
                    onChange={(e) => setProjDueDate(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setShowProjModal(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:opacity-95"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Add Course */}
      {showCourseModal && (
        <div className="fixed inset-0 bg-[#0d1c2e]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary"></div>
            
            <div className="p-6 border-b border-outline-variant">
              <div className="flex justify-between items-center">
                <h3 className="text-stat-value font-bold text-primary">Add Course Tracker</h3>
                <button onClick={() => setShowCourseModal(false)} className="text-outline hover:text-on-surface"><span className="material-symbols-outlined">close</span></button>
              </div>
            </div>

            <form onSubmit={handleCreateCourse} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Course Title</label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="e.g. AI Agentic Systems"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Platform</label>
                  <select
                    value={coursePlatform}
                    onChange={(e) => setCoursePlatform(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Udemy">Udemy</option>
                    <option value="FreeCodeCamp">FreeCodeCamp</option>
                    <option value="AI Course">AI Course</option>
                    <option value="Coursera">Coursera</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Initial Progress (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={courseProgress}
                    onChange={(e) => setCourseProgress(Number(e.target.value))}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Initial Study Hours</label>
                <input
                  type="number"
                  step="0.5"
                  value={courseHours}
                  onChange={(e) => setCourseHours(Number(e.target.value))}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">Study Goal / Focus Notes</label>
                <input
                  type="text"
                  value={courseNotes}
                  onChange={(e) => setCourseNotes(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="e.g. Complete Custom Hooks module before Friday"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setShowCourseModal(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-sm text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:opacity-95"
                >
                  Add Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};
