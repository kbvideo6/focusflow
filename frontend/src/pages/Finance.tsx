import React, { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface Transaction {
  id: number;
  amount: number;
  category: string;
  description: string;
  date: string;
  type?: 'expense' | 'income';
}

interface FinanceSummary {
  monthlyLimit: number;
  dailyLimit: number;
  monthlySpent: number;
  monthlyIncome: number;
  monthlyNetSavings: number;
  weeklySpent: number;
  weeklyIncome: number;
  weeklyNetSavings: number;
  weeklyTarget: number;
  dailySpent: number;
  dailyIncome: number;
  remainingMonthlyBudget: number;
  averageDailySpend: number;
  projectedMonthlySpend: number;
  safeDailyRemaining: number;
  expectedSavings: number;
  budgetStatus: 'healthy' | 'warning' | 'exceeded';
  totalDaysInMonth: number;
  dayOfMonth: number;
  daysRemainingInMonth: number;
  monthlyTxCount: number;
  categories: { category: string; amount: number; percentage: number }[];
  incomeCategories: { category: string; amount: number; percentage: number }[];
  trends: { date: string; day: string; amount: number; income: number; net: number }[];
  weeklyTrends: { weekLabel: string; startDate: string; endDate: string; income: number; spent: number; net: number; isCurrentWeek: boolean }[];
}

export const Finance: React.FC = () => {
  const { token, apiUrl } = useAuth();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis'>('overview');
  
  // Form states
  const [entryType, setEntryType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food & Dining');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search/Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');

  const expenseCategories = [
    'Food & Dining',
    'Transport',
    'Rent & Utilities',
    'Entertainment',
    'Shopping',
    'Gym & Health',
    'Skincare & Wellness',
    'Study & Projects',
    'Miscellaneous'
  ];

  const incomeCategories = [
    'Allowance / Family',
    'Part-time Job',
    'Freelance / Projects',
    'Scholarship / Stipend',
    'Gifts & Awards',
    'Other Income'
  ];

  // Auto-switch default category when entry type changes
  const handleTypeSwitch = (newType: 'expense' | 'income') => {
    setEntryType(newType);
    setCategory(newType === 'income' ? incomeCategories[0] : expenseCategories[0]);
  };

  const fetchFinanceData = async () => {
    if (!token) return;
    try {
      const transRes = await fetch(`${apiUrl}/tracker/finance/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (transRes.ok) setTransactions(await transRes.json());

      const sumRes = await fetch(`${apiUrl}/tracker/finance/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch (err) {
      console.error('Fetch finance error:', err);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, [token]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/tracker/finance/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parsedAmount,
          category,
          description: description.trim(),
          date,
          type: entryType
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add transaction.');
        return;
      }

      setAmount('');
      setDescription('');
      setSuccess(`${entryType === 'income' ? 'Income' : 'Expense'} added successfully!`);
      setTimeout(() => setSuccess(''), 3000);

      // Refresh data
      fetchFinanceData();
    } catch (err: any) {
      setError(err.message || 'Network error occurred.');
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!window.confirm('Delete this transaction?')) return;

    try {
      const res = await fetch(`${apiUrl}/tracker/finance/transactions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchFinanceData();
      }
    } catch (err) {
      console.error('Delete transaction failed:', err);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = 
        (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.category && t.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.date && t.date.includes(searchTerm));
      
      const itemType = t.type || 'expense';
      const matchesType = typeFilter === 'all' || itemType === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [transactions, searchTerm, typeFilter]);

  const monthlySpent = summary?.monthlySpent || 0;
  const monthlyIncome = summary?.monthlyIncome || 0;
  const monthlyLimit = summary?.monthlyLimit || 30000;
  const dailySpent = summary?.dailySpent || 0;
  const dailyLimit = summary?.dailyLimit || 1000;
  const weeklySpent = summary?.weeklySpent || 0;
  const weeklyIncome = summary?.weeklyIncome || 0;
  const weeklyNetSavings = summary?.weeklyNetSavings || (weeklyIncome - weeklySpent);

  const budgetPct = Math.min(100, Math.round((monthlySpent / monthlyLimit) * 100));
  const remainingBudget = summary?.remainingMonthlyBudget !== undefined ? summary.remainingMonthlyBudget : Math.max(0, monthlyLimit - monthlySpent);
  
  // Daily spending check alert
  const dailyWarning = dailySpent > dailyLimit;

  // Max value in 7-day trends for bar scaling
  const maxTrendAmount = useMemo(() => {
    if (!summary?.trends || summary.trends.length === 0) return dailyLimit * 1.5;
    const maxVal = Math.max(...summary.trends.map(t => Math.max(t.amount, t.income || 0)), dailyLimit);
    return maxVal * 1.15;
  }, [summary, dailyLimit]);

  return (
    <Layout title="Finance & Budgeting">
      <div className="space-y-stack-lg">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-background mb-2">Finance & Income Tracker</h1>
            <p className="text-body-md font-body-md text-outline">Track daily expenses, record weekly income, and inspect smart financial runway analytics.</p>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant shadow-sm w-fit self-end">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all ${
                activeTab === 'overview' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Overview & Entry
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-5 py-2 rounded-full text-label-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'analysis' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">analytics</span>
              Smart Financial Analysis
            </button>
          </div>
        </div>

        {/* Daily limit check alert overlay */}
        {dailyWarning && (
          <div className="bg-error-container/30 border border-error/20 p-4 rounded-xl flex items-start gap-3 relative overflow-hidden animate-fadeIn">
            <div className="absolute top-0 bottom-0 left-0 w-1 bg-error"></div>
            <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <div>
              <h4 className="text-body-md font-bold text-error">Daily Spending Limit Exceeded!</h4>
              <p className="text-xs text-on-error-container font-medium mt-0.5">
                You have spent <span className="font-bold text-error">{dailySpent.toLocaleString()} LKR</span> today, which exceeds your set daily threshold of <span className="font-semibold">{dailyLimit.toLocaleString()} LKR</span> by {(dailySpent - dailyLimit).toLocaleString()} LKR.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* KPI Cards Row (Monthly Budget, Weekly Income vs Spent, Daily Limit) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          {/* Monthly Budget Summary card */}
          <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-secondary mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Monthly Budget</span>
                </div>
                <span className="text-xs font-data-tabular font-bold text-outline">{budgetPct}% Spent</span>
              </div>
              <div className="mt-3">
                <span className="text-display-lg-mobile font-display-lg-mobile text-on-background font-bold font-data-tabular">
                  {monthlySpent.toLocaleString()}
                </span>
                <span className="text-headline-md text-outline font-data-tabular"> / {monthlyLimit.toLocaleString()} LKR</span>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <div className="w-full bg-surface-container h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${monthlySpent > monthlyLimit ? 'bg-error' : 'bg-secondary'}`}
                  style={{ width: `${budgetPct}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-on-surface-variant font-medium">
                <span>Remaining: <strong className="text-on-surface">{remainingBudget.toLocaleString()} LKR</strong></span>
                <span>Days Left: <strong className="text-on-surface">{summary?.daysRemainingInMonth || 1}</strong></span>
              </div>
            </div>
          </div>

          {/* Weekly Income & Cash Flow Tracking Card */}
          <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-primary mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">payments</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Weekly Income & Cash Flow</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  weeklyNetSavings >= 0 ? 'bg-secondary/15 text-secondary' : 'bg-error-container text-on-error-container'
                }`}>
                  {weeklyNetSavings >= 0 ? 'Net Positive' : 'Deficit'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="p-2.5 bg-secondary/10 rounded-lg border border-secondary/20">
                  <span className="text-[10px] font-bold text-secondary uppercase block">Weekly Income</span>
                  <span className="text-stat-value font-bold text-secondary font-data-tabular">+{weeklyIncome.toLocaleString()}</span>
                  <span className="text-[10px] text-outline block">LKR earned</span>
                </div>
                <div className="p-2.5 bg-primary/10 rounded-lg border border-primary/20">
                  <span className="text-[10px] font-bold text-primary uppercase block">Weekly Spent</span>
                  <span className="text-stat-value font-bold text-primary font-data-tabular">-{weeklySpent.toLocaleString()}</span>
                  <span className="text-[10px] text-outline block">LKR spent</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex justify-between items-center text-xs">
              <span className="text-outline font-medium">Net Weekly Savings:</span>
              <span className={`font-bold font-data-tabular text-sm ${weeklyNetSavings >= 0 ? 'text-secondary' : 'text-error'}`}>
                {weeklyNetSavings >= 0 ? `+${weeklyNetSavings.toLocaleString()}` : weeklyNetSavings.toLocaleString()} LKR
              </span>
            </div>
          </div>

          {/* Daily Budget Summary card */}
          <div className={`bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between ${
            dailyWarning ? 'border-error-container bg-error-container/5' : 'border-outline-variant'
          }`}>
            <div>
              <div className="flex justify-between items-start mb-2">
                <div className={`flex items-center gap-1.5 ${dailyWarning ? 'text-error' : 'text-outline'}`}>
                  <span className="material-symbols-outlined text-sm">alarm</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Today's Spend</span>
                </div>
                {dailyWarning ? (
                  <span className="bg-error text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                    Over Limit
                  </span>
                ) : (
                  <span className="bg-secondary/15 text-secondary px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                    On Track
                  </span>
                )}
              </div>
              <div className="mt-3">
                <span className={`text-display-lg-mobile font-display-lg-mobile font-bold font-data-tabular ${dailyWarning ? 'text-error' : 'text-on-background'}`}>
                  {dailySpent.toLocaleString()}
                </span>
                <span className="text-headline-md text-outline font-data-tabular"> / {dailyLimit.toLocaleString()} LKR</span>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <div className="w-full bg-surface-container h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${dailyWarning ? 'bg-error' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, Math.round((dailySpent / dailyLimit) * 100))}%` }}
                ></div>
              </div>
              <p className={`text-xs ${dailyWarning ? 'text-error font-bold' : 'text-outline font-medium'}`}>
                {dailyWarning 
                  ? `Exceeded limit by ${(dailySpent - dailyLimit).toLocaleString()} LKR` 
                  : `${Math.max(0, dailyLimit - dailySpent).toLocaleString()} LKR remaining today`
                }
              </p>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Tab 1: Overview & Entry */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
            {/* Quick Entry Form (Expense vs Income toggle) */}
            <div className="md:col-span-5 bg-white border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col space-y-5">
              <div className="flex justify-between items-center pb-3 border-b border-outline-variant/30">
                <h3 className="text-headline-md font-bold text-on-background border-l-4 border-primary pl-3">
                  Log Transaction
                </h3>

                {/* Expense vs Income Switch */}
                <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant/40">
                  <button
                    type="button"
                    onClick={() => handleTypeSwitch('expense')}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      entryType === 'expense' ? 'bg-error text-white shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeSwitch('income')}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      entryType === 'income' ? 'bg-secondary text-white shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    + Income
                  </button>
                </div>
              </div>
              
              <form onSubmit={handleAddTransaction} className="space-y-4">
                {error && <div className="p-3 bg-error-container text-on-error-container text-xs rounded-lg font-medium">{error}</div>}
                {success && <div className="p-3 bg-secondary/15 text-secondary text-xs rounded-lg font-medium">{success}</div>}

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    {entryType === 'income' ? 'Income Amount (LKR)' : 'Expense Amount (LKR)'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={`w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-stat-value font-stat-value font-bold focus:ring-2 focus:outline-none ${
                        entryType === 'income' ? 'text-secondary focus:ring-secondary' : 'text-error focus:ring-primary'
                      }`}
                      placeholder="0.00"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-data-tabular font-bold">LKR</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">
                    {entryType === 'income' ? 'Income Source' : 'Category'}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-body-md focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                  >
                    {(entryType === 'income' ? incomeCategories : expenseCategories).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-body-md focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder={entryType === 'income' ? 'e.g. Monthly university stipend, Freelance frontend gig' : 'e.g. Uber Ride, Weekly Supermarket'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-body-md focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className={`w-full py-3.5 rounded-lg text-label-sm font-semibold text-white transition-all shadow-sm active:scale-98 duration-100 flex items-center justify-center gap-2 ${
                    entryType === 'income' ? 'bg-secondary hover:bg-secondary/90' : 'bg-primary hover:bg-primary/95'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{entryType === 'income' ? 'add_circle' : 'receipt_long'}</span>
                  {entryType === 'income' ? 'Record Income Money' : 'Log Expense Transaction'}
                </button>
              </form>
            </div>

            {/* Quick 7-Day Mini Chart Preview & Weekly Overview */}
            <div className="md:col-span-7 space-y-gutter">
              {/* 7-Day Spending & Income Bar Visualizer */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-body-md font-bold text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">equalizer</span>
                    Past 7 Days Cash Flow
                  </h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-secondary font-semibold">
                      <span className="w-2.5 h-2.5 rounded-full bg-secondary inline-block"></span> Income
                    </span>
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block"></span> Expense
                    </span>
                  </div>
                </div>

                <div className="h-44 flex items-end justify-between gap-2 pt-6 pb-2 border-b border-outline-variant/30">
                  {summary?.trends?.map((t, idx) => {
                    const expenseHeight = Math.min(100, Math.round((t.amount / maxTrendAmount) * 100));
                    const incomeHeight = Math.min(100, Math.round(((t.income || 0) / maxTrendAmount) * 100));
                    const isOver = t.amount > dailyLimit;

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                        {/* Tooltip */}
                        <div className="absolute -top-12 bg-inverse-surface text-inverse-on-surface px-2 py-1 rounded text-[10px] font-data-tabular opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none shadow-md">
                          <div>Expense: {t.amount.toLocaleString()} LKR</div>
                          {t.income > 0 && <div className="text-secondary-fixed">Income: +{t.income.toLocaleString()} LKR</div>}
                        </div>

                        {/* Bars container */}
                        <div className="w-full flex items-end justify-center gap-1 h-32">
                          {/* Income bar */}
                          {t.income > 0 && (
                            <div 
                              className="w-3 rounded-t-sm bg-secondary transition-all"
                              style={{ height: `${Math.max(4, incomeHeight)}%` }}
                            ></div>
                          )}
                          {/* Expense bar */}
                          <div
                            className={`w-3.5 rounded-t-sm transition-all ${isOver ? 'bg-error' : 'bg-primary'}`}
                            style={{ height: `${Math.max(4, expenseHeight)}%` }}
                          ></div>
                        </div>

                        <span className="text-[11px] text-outline font-bold mt-2 font-data-tabular">{t.day}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center text-[11px] text-outline mt-2 font-data-tabular">
                  <span>Target Daily Limit: {dailyLimit.toLocaleString()} LKR</span>
                  <span>7-Day Total Expense: {summary?.trends?.reduce((acc, t) => acc + t.amount, 0).toLocaleString()} LKR</span>
                </div>
              </div>

              {/* Weekly Performance Accordion / Summary */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm">
                <h3 className="text-body-md font-bold text-on-background flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-secondary text-sm">date_range</span>
                  Weekly Income vs Spending Breakdown
                </h3>

                <div className="space-y-3">
                  {summary?.weeklyTrends?.map((week, idx) => (
                    <div key={idx} className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      week.isCurrentWeek ? 'bg-primary-fixed/20 border-primary/30' : 'bg-[#f8f9ff] border-outline-variant/30'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${week.isCurrentWeek ? 'bg-primary' : 'bg-outline'}`}></span>
                        <div>
                          <p className="text-xs font-bold text-on-background">
                            {week.weekLabel} {week.isCurrentWeek && <span className="text-[10px] text-primary uppercase font-bold ml-1">(Current Week)</span>}
                          </p>
                          <p className="text-[11px] text-outline">
                            Income: <strong className="text-secondary font-data-tabular">+{week.income.toLocaleString()}</strong> | Spent: <strong className="text-error font-data-tabular">-{week.spent.toLocaleString()} LKR</strong>
                          </p>
                        </div>
                      </div>

                      <div className="text-right sm:self-center">
                        <span className={`text-xs font-bold font-data-tabular ${week.net >= 0 ? 'text-secondary' : 'text-error'}`}>
                          Net: {week.net >= 0 ? `+${week.net.toLocaleString()}` : week.net.toLocaleString()} LKR
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Tab 2: Smart Financial Analysis & Runway Insights */}
        {/* ========================================================================= */}
        {activeTab === 'analysis' && (
          <div className="space-y-stack-md max-w-5xl mx-auto">
            {/* Projections & Financial Runway Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {/* Daily Burn Rate */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-primary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Daily Burn Rate</span>
                    <span className="material-symbols-outlined">speed</span>
                  </div>
                  <div className="text-stat-value font-bold text-on-background font-data-tabular">
                    {summary?.averageDailySpend?.toLocaleString() || 0} <span className="text-xs text-outline font-semibold">LKR/day</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-outline font-medium">
                  Average spend across {summary?.dayOfMonth || 1} elapsed days
                </div>
              </div>

              {/* Safe Daily Remaining Allowance */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-secondary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Safe Daily Allowance</span>
                    <span className="material-symbols-outlined">savings</span>
                  </div>
                  <div className="text-stat-value font-bold text-secondary font-data-tabular">
                    {summary?.safeDailyRemaining?.toLocaleString() || 0} <span className="text-xs text-outline font-semibold">LKR/day</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-outline font-medium">
                  Spendable per day for next {summary?.daysRemainingInMonth || 1} days to stay on budget
                </div>
              </div>

              {/* Projected Month-End Total */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-tertiary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Projected Month-End</span>
                    <span className="material-symbols-outlined">trending_up</span>
                  </div>
                  <div className="text-stat-value font-bold text-on-background font-data-tabular">
                    {summary?.projectedMonthlySpend?.toLocaleString() || 0} <span className="text-xs text-outline font-semibold">LKR</span>
                  </div>
                </div>
                <div className="mt-3 text-xs font-medium">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    (summary?.projectedMonthlySpend || 0) <= monthlyLimit 
                      ? 'bg-secondary/15 text-secondary' 
                      : 'bg-error-container text-on-error-container'
                  }`}>
                    {(summary?.projectedMonthlySpend || 0) <= monthlyLimit ? 'Within Budget Target' : 'Risk of Overspending'}
                  </span>
                </div>
              </div>

              {/* Total Monthly Income */}
              <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-secondary mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Monthly Income</span>
                    <span className="material-symbols-outlined">account_balance</span>
                  </div>
                  <div className="text-stat-value font-bold text-secondary font-data-tabular">
                    +{monthlyIncome.toLocaleString()} <span className="text-xs text-outline font-semibold">LKR</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-outline font-medium">
                  Net Monthly Cash Flow: <strong className="text-on-surface font-data-tabular">{(monthlyIncome - monthlySpent).toLocaleString()} LKR</strong>
                </div>
              </div>
            </div>

            {/* Smart Financial Insights & Recommendations */}
            <div className="bg-gradient-to-r from-primary-container/10 via-surface-container-low to-secondary-container/10 border border-primary/20 rounded-xl p-6 shadow-sm">
              <h3 className="text-headline-md font-bold text-on-background flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary">psychology</span>
                Smart Financial Advisory Insights
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-outline-variant/30 shadow-xs space-y-1">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">Spending Velocity</span>
                  <p className="text-xs text-on-surface font-medium leading-relaxed">
                    {summary?.averageDailySpend && summary.averageDailySpend > dailyLimit
                      ? `Your daily average of ${summary.averageDailySpend.toLocaleString()} LKR is higher than your ${dailyLimit.toLocaleString()} LKR target. Consider cutting dining or discretionary expenses.`
                      : `You are spending an average of ${summary?.averageDailySpend?.toLocaleString() || 0} LKR/day, well within your daily allowance.`
                    }
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-outline-variant/30 shadow-xs space-y-1">
                  <span className="text-xs font-bold text-secondary uppercase tracking-wider block">Savings Forecast</span>
                  <p className="text-xs text-on-surface font-medium leading-relaxed">
                    {summary?.expectedSavings && summary.expectedSavings > 0
                      ? `At this current burn rate, you will save approximately ${summary.expectedSavings.toLocaleString()} LKR by the end of this month!`
                      : `You are currently projected to exceed your monthly allowance. Restrict daily spend to ${summary?.safeDailyRemaining?.toLocaleString() || 0} LKR/day.`
                    }
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-outline-variant/30 shadow-xs space-y-1">
                  <span className="text-xs font-bold text-tertiary uppercase tracking-wider block">Weekly Cash Flow</span>
                  <p className="text-xs text-on-surface font-medium leading-relaxed">
                    {weeklyNetSavings >= 0
                      ? `Weekly surplus of +${weeklyNetSavings.toLocaleString()} LKR this week. Great job managing your university budget!`
                      : `Weekly deficit of ${weeklyNetSavings.toLocaleString()} LKR. Aim to increase weekly income streams or reduce dining out.`
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Category Expense Breakdown Bars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              {/* Expense Category Breakdown */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-4">
                <h3 className="text-headline-md font-bold text-on-background border-l-4 border-error pl-3">
                  Expenses by Category
                </h3>
                {summary?.categories && summary.categories.length > 0 ? (
                  <div className="space-y-3">
                    {summary.categories.map((cat, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-semibold">
                          <span className="text-on-surface">{cat.category}</span>
                          <span className="font-data-tabular text-on-background">
                            {cat.amount.toLocaleString()} LKR <span className="text-outline font-normal">({cat.percentage}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-300"
                            style={{ width: `${cat.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-outline py-6 text-center">No expense transactions recorded this month.</p>
                )}
              </div>

              {/* Income Sources Breakdown */}
              <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-4">
                <h3 className="text-headline-md font-bold text-on-background border-l-4 border-secondary pl-3">
                  Income Sources Breakdown
                </h3>
                {summary?.incomeCategories && summary.incomeCategories.length > 0 ? (
                  <div className="space-y-3">
                    {summary.incomeCategories.map((cat, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-semibold">
                          <span className="text-on-surface">{cat.category}</span>
                          <span className="font-data-tabular text-secondary font-bold">
                            +{cat.amount.toLocaleString()} LKR <span className="text-outline font-normal">({cat.percentage}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-secondary h-full rounded-full transition-all duration-300"
                            style={{ width: `${cat.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-outline py-6 text-center">No income transactions recorded this month. Use "+ Income" to log allowances or earnings!</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Ledger Transaction History List */}
        {/* ========================================================================= */}
        <div className="bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex flex-col md:flex-row justify-between items-center gap-4">
            <h3 className="text-headline-md font-headline-md text-on-background font-bold">Transaction History Ledger</h3>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
              {/* Filter Pills */}
              <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant/40">
                <button
                  type="button"
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                    typeFilter === 'all' ? 'bg-white shadow-xs text-primary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  All ({transactions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('expense')}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                    typeFilter === 'expense' ? 'bg-white shadow-xs text-error' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Expenses
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('income')}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                    typeFilter === 'income' ? 'bg-white shadow-xs text-secondary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Income
                </button>
              </div>

              {/* Search input */}
              <div className="relative flex-grow sm:w-60">
                <span className="material-symbols-outlined absolute left-3 top-1/2 transform -translate-y-1/2 text-outline text-sm">search</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#f8f9ff] border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary text-data-tabular font-data-tabular text-xs"
                  placeholder="Search ledger..."
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-bright text-xs text-outline border-b border-outline-variant uppercase tracking-wider">
                  <th className="p-4 font-bold">Date</th>
                  <th className="p-4 font-bold">Type</th>
                  <th className="p-4 font-bold">Description</th>
                  <th className="p-4 font-bold">Category / Source</th>
                  <th className="p-4 font-bold text-right">Amount (LKR)</th>
                  <th className="p-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-data-tabular font-data-tabular text-on-background divide-y divide-outline-variant/50">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">No transactions found.</td>
                  </tr>
                ) : (
                  filteredTransactions.map((t) => {
                    const isIncome = t.type === 'income';

                    return (
                      <tr key={t.id} className="hover:bg-surface-bright transition-colors">
                        <td className="p-4 text-outline text-xs">{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                            isIncome ? 'bg-secondary/15 text-secondary border border-secondary/30' : 'bg-primary/10 text-primary'
                          }`}>
                            {isIncome ? 'Income' : 'Expense'}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-sm">{t.description || '(No Description)'}</td>
                        <td className="p-4">
                          <span className="bg-surface-container px-2.5 py-1 rounded text-label-sm font-semibold text-on-surface text-xs">
                            {t.category}
                          </span>
                        </td>
                        <td className={`p-4 text-right font-bold text-sm ${isIncome ? 'text-secondary' : 'text-error'}`}>
                          {isIncome ? `+${t.amount.toLocaleString()}.00` : `-${t.amount.toLocaleString()}.00`}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteTransaction(t.id)}
                            className="p-1 text-outline hover:text-error hover:bg-error-container/20 rounded transition-colors"
                            title="Delete transaction"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
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
    </Layout>
  );
};
