import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

interface Transaction {
  id: number;
  amount: number;
  category: string;
  description: string;
  date: string;
}

interface FinanceSummary {
  monthlyLimit: number;
  dailyLimit: number;
  monthlySpent: number;
  dailySpent: number;
  categories: { category: string; amount: number }[];
  trends: { date: string; day: string; amount: number }[];
}

export const Finance: React.FC = () => {
  const { token, apiUrl } = useAuth();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  
  // Form states
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food & Dining');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search/Filter state
  const [searchTerm, setSearchTerm] = useState('');

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
          date
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add transaction.');
        return;
      }

      setAmount('');
      setDescription('');
      setSuccess('Transaction added successfully!');
      
      // Clear success message after 3 seconds
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

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = 
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const monthlySpent = summary?.monthlySpent || 0;
  const monthlyLimit = summary?.monthlyLimit || 30000;
  const dailySpent = summary?.dailySpent || 0;
  const dailyLimit = summary?.dailyLimit || 1000;

  const budgetPct = Math.min(100, Math.round((monthlySpent / monthlyLimit) * 100));
  const remainingBudget = Math.max(0, monthlyLimit - monthlySpent);
  
  // Daily spending check alert
  const dailyWarning = dailySpent > dailyLimit;

  return (
    <Layout title="Finance & Budgeting">
      <div className="space-y-stack-lg">
        {/* Header Title */}
        <div>
          <h1 className="text-display-lg-mobile md:text-display-lg font-display-lg-mobile md:font-display-lg text-on-background mb-2">Finance Overview</h1>
          <p className="text-body-md font-body-md text-outline mt-2">Manage your budget limits and track your daily uni expenses.</p>
        </div>

        {/* Daily limit check alert overlay */}
        {dailyWarning && (
          <div className="bg-error-container/30 border border-error/20 p-4 rounded-xl flex items-start gap-3 relative overflow-hidden">
            <div className="absolute top-0 bottom-0 left-0 w-1 bg-error"></div>
            <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <div>
              <h4 className="text-body-md font-bold text-error">Daily Budget Exceeded!</h4>
              <p className="text-xs text-on-error-container font-medium mt-0.5">
                You have spent <span className="font-bold text-error">{dailySpent.toLocaleString()} LKR</span> today, which exceeds your set daily threshold of <span className="font-semibold">{dailyLimit.toLocaleString()} LKR</span> by {(dailySpent - dailyLimit).toLocaleString()} LKR.
              </p>
            </div>
          </div>
        )}

        {/* Bento Grid: Quick Entry & Budget Limit Bars */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
          {/* Fast Entry Transaction Form */}
          <div className="md:col-span-4 bg-white border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col space-y-6">
            <h3 className="text-headline-md font-headline-md font-bold text-on-background border-l-4 border-primary pl-3">Quick Entry</h3>
            
            <form onSubmit={handleAddTransaction} className="space-y-4">
              {error && <div className="p-3 bg-error-container text-on-error-container text-xs rounded font-medium">{error}</div>}
              {success && <div className="p-3 bg-secondary/15 text-secondary text-xs rounded font-medium">{success}</div>}

              <div>
                <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Amount (LKR)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-stat-value font-stat-value focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder="0.00"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-outline font-data-tabular font-bold">LKR</span>
                </div>
              </div>

              <div>
                <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-body-md focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
                >
                  <option value="Food & Dining">Food & Dining</option>
                  <option value="Transport">Transport</option>
                  <option value="Rent & Utilities">Rent & Utilities (Rent)</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Gym & Health">Gym & Health</option>
                  <option value="Skincare & Wellness">Skincare & Wellness</option>
                  <option value="Study & Projects">Study & Projects</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>

              <div>
                <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#f8f9ff] border border-outline-variant rounded-lg p-3 text-body-md focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="e.g. Uber Ride, Weekly Rent"
                />
              </div>

              <div>
                <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1 font-semibold uppercase tracking-wider">Date</label>
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
                className="w-full bg-primary text-on-primary py-3.5 rounded-lg text-label-sm font-semibold hover:bg-primary/95 transition-colors shadow-sm active:scale-95 duration-100"
              >
                Add Transaction
              </button>
            </form>
          </div>

          {/* Budget Limits and Exceeding Indicators */}
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-gutter h-fit">
            {/* Monthly Budget Summary card */}
            <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col justify-between h-[230px]">
              <div>
                <div className="flex items-center space-x-2 text-secondary mb-2">
                  <span className="material-symbols-outlined">account_balance_wallet</span>
                  <span className="text-label-sm font-label-sm font-bold uppercase tracking-wider">Monthly Budget</span>
                </div>
                <div className="mt-4">
                  <span className="text-display-lg-mobile font-display-lg-mobile text-on-background font-bold">
                    {monthlySpent.toLocaleString()}
                  </span>
                  <span className="text-headline-md font-headline-md text-outline"> / {monthlyLimit.toLocaleString()} LKR</span>
                </div>
              </div>
              <div className="mt-8">
                <div className="flex justify-between text-label-sm font-label-sm text-on-surface-variant mb-2">
                  <span>{budgetPct}% Spent</span>
                  <span>{remainingBudget.toLocaleString()} LKR Remaining</span>
                </div>
                <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${monthlySpent > monthlyLimit ? 'bg-error' : 'bg-secondary'}`}
                    style={{ width: `${budgetPct}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Daily Budget Summary card */}
            <div className={`bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between h-[230px] relative overflow-hidden ${
              dailyWarning ? 'border-error-container' : 'border-outline-variant'
            }`}>
              {dailyWarning && <div className="absolute inset-0 bg-error-container/5 pointer-events-none"></div>}
              <div>
                <div className="flex justify-between items-start mb-2">
                  <div className={`flex items-center space-x-2 ${dailyWarning ? 'text-error' : 'text-outline'}`}>
                    <span className="material-symbols-outlined">warning</span>
                    <span className="text-label-sm font-label-sm font-bold uppercase tracking-wider">Daily Limit</span>
                  </div>
                  {dailyWarning && (
                    <span className="bg-error-container text-on-error-container px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                      Over Limit
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <span className={`text-display-lg-mobile font-display-lg-mobile font-bold ${dailyWarning ? 'text-error' : 'text-on-background'}`}>
                    {dailySpent.toLocaleString()}
                  </span>
                  <span className="text-headline-md font-headline-md text-outline"> / {dailyLimit.toLocaleString()} LKR</span>
                </div>
              </div>
              <div className="mt-8">
                <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${dailyWarning ? 'bg-error' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, Math.round((dailySpent / dailyLimit) * 100))}%` }}
                  ></div>
                </div>
                <p className={`text-label-sm font-label-sm mt-2 ${dailyWarning ? 'text-error font-medium' : 'text-outline'}`}>
                  {dailyWarning 
                    ? `Exceeded your limit by ${(dailySpent - dailyLimit).toLocaleString()} LKR` 
                    : `${Math.max(0, dailyLimit - dailySpent).toLocaleString()} LKR remaining for today`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Ledger Transaction History List */}
        <div className="bg-white border border-outline-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex flex-col md:flex-row justify-between items-center gap-4">
            <h3 className="text-headline-md font-headline-md text-on-background font-bold">Transaction History</h3>
            <div className="flex gap-3 w-full md:w-auto">
              <div className="relative flex-grow md:w-64">
                <span className="material-symbols-outlined absolute left-3 top-1/2 transform -translate-y-1/2 text-outline text-sm">search</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#f8f9ff] border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary text-data-tabular font-data-tabular text-sm"
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
                  <th className="p-4 font-bold">Description</th>
                  <th className="p-4 font-bold">Category</th>
                  <th className="p-4 font-bold text-right">Amount (LKR)</th>
                  <th className="p-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-data-tabular font-data-tabular text-on-background divide-y divide-outline-variant/50">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-on-surface-variant font-medium">No transactions found.</td>
                  </tr>
                ) : (
                  filteredTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-bright transition-colors">
                      <td className="p-4 text-outline">{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="p-4 font-semibold">{t.description || '(No Description)'}</td>
                      <td className="p-4">
                        <span className="bg-surface-container px-2 py-1 rounded text-label-sm font-semibold text-on-surface text-xs">
                          {t.category}
                        </span>
                      </td>
                      <td className="p-4 text-right font-bold text-error">-{t.amount.toLocaleString()}.00</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteTransaction(t.id)}
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
    </Layout>
  );
};
