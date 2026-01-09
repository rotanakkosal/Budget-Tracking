
'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import "./globals.css";

type IncomeRow = { id: string; date: string; desc: string; amount: number; notes?: string };
type ExpenseRow = { id: string; date: string; category: string; desc: string; amount: number; notes?: string };
type Tab = "income" | "expenses" | "summary";
type ToastType = "info" | "success" | "error";
type Toast = { id: string; message: string; type: ToastType };

const RATE_STORAGE_KEY = 'budget_rate';
const RATE_FETCHED_AT_KEY = 'budget_rate_timestamp';
const RATE_MAX_AGE_MS = 1000 * 60 * 60 * 12;

const fmtKRW = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEFAULT_CATEGORIES = [
  'Room and Utility',
  'Daily Expense',
  'Borrow Others',
  'Food & Drinks',
  'Transportation',
  'Entertainment',
  'Shopping',
  'Other'
] as const;

function uid(){ return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
function krwToUsd(krw:number, rate:number){
  const normalizedRate = Number(rate);
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) return 0;
  return Number(krw) / normalizedRate;
}

export default function Page(){
  const { data: session, status } = useSession();
  const router = useRouter();

  // ALL HOOKS MUST BE DECLARED BEFORE ANY EARLY RETURNS
  const [rate, setRate] = useState(1388);
  const [tab, setTab] = useState<Tab>('income');
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<string[]>([...DEFAULT_CATEGORIES]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [incomeForm, setIncomeForm] = useState({ date: "", desc: "", amount: "", notes: "" });
  const [expenseForm, setExpenseForm] = useState({ date: "", category: "", desc: "", amount: "", notes: "" });

  // Loading states
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isAddingIncome, setIsAddingIncome] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const incomeDateRef = useRef<HTMLInputElement>(null);
  const expenseDateRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((message: string, type: ToastType = 'info', timeout = 2500) => {
    const id = uid();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), timeout);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Load theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('budget_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  // Toggle theme function
  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('budget_theme', newTheme);
  }, [theme]);

  // Load saved exchange rate
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RATE_STORAGE_KEY);
      if (!saved) return;
      const parsed = Number(saved);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      setRate(parsed);
    } catch (err) {
      console.error('Failed to load saved exchange rate', err);
    }
  }, []);

  // Load tab from localStorage
  useEffect(() => {
    const last = localStorage.getItem('budget_active_tab') as Tab | null;
    if (last) setTab(last);
  }, []);

  // Save tab to localStorage
  useEffect(() => {
    localStorage.setItem('budget_active_tab', tab);
  }, [tab]);

  // Fetch exchange rate
  useEffect(() => {
    let cancelled = false;
    async function refreshRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/KRW');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const usdPerKrw = Number(data?.rates?.USD);
        if (!Number.isFinite(usdPerKrw) || usdPerKrw <= 0) throw new Error('Invalid rate data');
        const krwPerUsd = 1 / usdPerKrw;
        if (cancelled) return;
        setRate(krwPerUsd);
        try {
          localStorage.setItem(RATE_STORAGE_KEY, String(krwPerUsd));
          localStorage.setItem(RATE_FETCHED_AT_KEY, String(Date.now()));
        } catch (storageErr) {
          console.error('Failed to persist exchange rate', storageErr);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch KRW to USD rate', err);
        toast('Unable to refresh exchange rate. Using the last known value.', 'error', 4000);
      }
    }

    try {
      const lastFetched = Number(localStorage.getItem(RATE_FETCHED_AT_KEY));
      if (!Number.isFinite(lastFetched) || (Date.now() - lastFetched) > RATE_MAX_AGE_MS) {
        refreshRate();
      }
    } catch (err) {
      console.error('Failed to read stored exchange rate timestamp', err);
      refreshRate();
    }

    return () => { cancelled = true; };
  }, [toast]);

  // Load data from database on mount
  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    async function loadData() {
      setIsLoadingData(true);
      try {
        const [incomeRes, expensesRes, categoriesRes] = await Promise.all([
          fetch('/api/income'),
          fetch('/api/expenses'),
          fetch('/api/categories')
        ]);

        if (cancelled) return;

        if (!incomeRes.ok || !expensesRes.ok) {
          throw new Error('Failed to fetch data from server');
        }

        const incomeData = await incomeRes.json();
        const expensesData = await expensesRes.json();
        const categoriesData = categoriesRes.ok ? await categoriesRes.json() : [];

        if (cancelled) return;

        const inc: IncomeRow[] = Array.isArray(incomeData) ? incomeData.map((r: any) => ({
          id: r.id,
          date: r.date,
          desc: r.description || r.desc,
          amount: Number(r.amount),
          notes: r.notes || ''
        })) : [];

        const exp: ExpenseRow[] = Array.isArray(expensesData) ? expensesData.map((r: any) => ({
          id: r.id,
          date: r.date,
          category: r.category,
          desc: r.description || r.desc,
          amount: Number(r.amount),
          notes: r.notes || ''
        })) : [];

        setIncome(inc);
        setExpenses(exp);

        const dbCats = Array.isArray(categoriesData) ? categoriesData.map((c: any) => c.name) : [];
        const expCats = exp.map(e => e.category).filter(Boolean);
        const allCats = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCats, ...expCats]));
        setCategories(allCats);

      } catch (err) {
        console.error('Failed to load data from database:', err);
        if (cancelled) return;
        toast("Failed to load data from server. Please refresh the page.", "error", 5000);
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [status, toast]);

  // Set today's date on form refs
  useEffect(() => {
    const setToday = (el: HTMLInputElement | null) => {
      if (!el || el.value) return;
      const t = new Date();
      const m = String(t.getMonth() + 1).padStart(2, '0');
      const d = String(t.getDate()).padStart(2, '0');
      el.value = `${t.getFullYear()}-${m}-${d}`;
    };
    setToday(incomeDateRef.current);
    setToday(expenseDateRef.current);
  }, [tab]);

  // Initialize date fields in form state
  useEffect(() => {
    const t = new Date();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    const today = `${t.getFullYear()}-${m}-${d}`;

    if (!incomeForm.date) {
      setIncomeForm(f => ({ ...f, date: today }));
    }
    if (!expenseForm.date) {
      setExpenseForm(f => ({ ...f, date: today }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computed values
  const totals = useMemo(() => {
    const incomeKRW = income.reduce((s, r) => s + Number(r.amount || 0), 0);
    const expenseKRW = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
    const remainingKRW = incomeKRW - expenseKRW;
    return {
      incomeKRW, expenseKRW, remainingKRW,
      incomeUSD: krwToUsd(incomeKRW, rate),
      expenseUSD: krwToUsd(expenseKRW, rate),
      remainingUSD: krwToUsd(remainingKRW, rate)
    };
  }, [income, expenses, rate]);

  const breakdown = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const e of expenses) byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
    return byCat;
  }, [expenses]);

  const incomeUSD = useMemo(() => {
    const v = Number(incomeForm.amount || 0);
    return fmtUSD.format(krwToUsd(v, rate));
  }, [incomeForm.amount, rate]);

  const expenseUSD = useMemo(() => {
    const v = Number(expenseForm.amount || 0);
    return fmtUSD.format(krwToUsd(v, rate));
  }, [expenseForm.amount, rate]);

  // EARLY RETURNS - After all hooks are declared
  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg)', gap: '24px' }}>
        <span className="loader"></span>
        <div style={{ color: 'var(--text-dim)', fontSize: '1rem' }}>Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // Event handlers
  async function onAddIncome(e: React.FormEvent) {
    e.preventDefault();
    const date = incomeForm.date.trim();
    const desc = incomeForm.desc.trim();
    const amount = Math.round(Number(incomeForm.amount));

    const errors: string[] = [];
    if (!date) errors.push("Date");
    if (!(amount > 0)) errors.push("Amount");

    if (errors.length > 0) {
      toast(`Please fill in: ${errors.join(", ")}`, "error", 3500);
      return;
    }
    const row: IncomeRow = { id: uid(), date, desc: desc || "Income", amount, notes: incomeForm.notes.trim() };

    setIsAddingIncome(true);
    try {
      const res = await fetch('/api/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save income');
      }

      setIncome(v => [...v, row]);
      toast("Income added", "success");
      setIncomeForm(f => ({ date: f.date, desc: "", amount: "", notes: "" }));
    } catch (err: any) {
      console.error('Error saving income:', err);
      toast(err.message || "Failed to save income to database.", "error", 4000);
    } finally {
      setIsAddingIncome(false);
    }
  }

  async function onAddExpense(e: React.FormEvent) {
    e.preventDefault();
    const date = expenseForm.date.trim();
    const category = expenseForm.category.trim();
    const desc = expenseForm.desc.trim();
    const amount = Math.round(Number(expenseForm.amount));

    const errors: string[] = [];
    if (!date) errors.push("Date");
    if (!(amount > 0)) errors.push("Amount");

    if (errors.length > 0) {
      toast(`Please fill in: ${errors.join(", ")}`, "error", 3500);
      return;
    }
    const row: ExpenseRow = { id: uid(), date, category: category || "Other", desc: desc || "Expense", amount, notes: expenseForm.notes.trim() };

    setIsAddingExpense(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save expense');
      }

      setExpenses(v => [...v, row]);
      toast("Expense added", "success");
      setExpenseForm(f => ({ date: f.date, category: "", desc: "", amount: "", notes: "" }));
    } catch (err: any) {
      console.error('Error saving expense:', err);
      toast(err.message || "Failed to save expense to database.", "error", 4000);
    } finally {
      setIsAddingExpense(false);
    }
  }

  function onAddCategory() {
    const name = window.prompt('New category name')?.trim();
    if (!name) return;
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) {
      toast('Category already exists', 'error', 3000);
      return;
    }
    setCategories(c => [...c, name]);
    setExpenseForm(f => ({ ...f, category: name }));
    toast('Category added', 'success');
  }

  async function onDelete(id: string, type: "income" | "expense") {
    const ok = window.confirm('Delete this record? This cannot be undone.');
    if (!ok) return;

    const endpoint = type === "income" ? '/api/income' : '/api/expenses';

    setDeletingId(id);
    try {
      const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete record');
      }

      if (type === "income") setIncome(v => v.filter(r => r.id !== id));
      else setExpenses(v => v.filter(r => r.id !== id));
      toast("Record deleted", "success");
    } catch (err: any) {
      console.error('Error deleting record:', err);
      toast(err.message || "Failed to delete record from database.", "error", 4000);
    } finally {
      setDeletingId(null);
    }
  }

  function exportJSON() {
    const data = { version: 1, rate, exportedAt: new Date().toISOString(), income, expenses, categories };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date();
    const name = `budget_export_${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}.json`;
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Exported JSON downloaded", "success");
  }

  function importJSONFromPicker() {
    fileInputRef.current?.click();
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onerror = () => toast("Failed to read file.", "error", 3500);
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || "{}"));
        if (!obj || !Array.isArray(obj.income) || !Array.isArray(obj.expenses)) {
          throw new Error("Invalid format: Missing income/expenses arrays");
        }
        const confirmReplace = window.confirm("Import will REPLACE your current data. Continue?");
        if (!confirmReplace) return;
        const inc: IncomeRow[] = obj.income.map((n: any) => ({ id: n.id || uid(), date: n.date || "", desc: n.desc || "", amount: Math.max(0, Number(n.amount || 0)), notes: n.notes || "" }));
        const exp: ExpenseRow[] = obj.expenses.map((n: any) => ({ id: n.id || uid(), date: n.date || "", category: n.category || "Other", desc: n.desc || "", amount: Math.max(0, Number(n.amount || 0)), notes: n.notes || "" }));
        const cat: string[] = Array.isArray(obj.categories) && obj.categories.length ? obj.categories.map((c: any) => String(c)) : [...DEFAULT_CATEGORIES];
        setIncome(inc); setExpenses(exp); setCategories(Array.from(new Set([...cat, ...exp.map(e => e.category)])));
        toast("Import successful", "success");
      } catch (err: any) {
        toast("Import failed: " + err.message, "error", 5000);
      }
    };
    reader.readAsText(f);
  }

  function clearAll() {
    const ok = window.confirm('Clear ALL data (income + expenses)? This cannot be undone.');
    if (!ok) return;
    setIncome([]); setExpenses([]); setCategories([...DEFAULT_CATEGORIES]);
    toast("All data cleared", "success");
  }

  return (
    <>
      <header className="app-header">
        <div className="container header-content">
          <div className="brand"><span className="dot"></span> Personal Budget Tracker</div>
          <nav className="tabs" role="tablist" aria-label="Budget Tabs">
            <button className="tab-btn" role="tab" aria-selected={tab === 'income'} onClick={() => setTab('income')}>Income</button>
            <button className="tab-btn" role="tab" aria-selected={tab === 'expenses'} onClick={() => setTab('expenses')}>Expenses</button>
            <button className="tab-btn" role="tab" aria-selected={tab === 'summary'} onClick={() => setTab('summary')}>Summary</button>
          </nav>
          <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>{session.user?.email}</span>
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="btn btn-sm" onClick={() => signOut({ callbackUrl: '/login' })} style={{ padding: '6px 12px' }}>Logout</button>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Income Tab */}
        <section id="tab-income" className="tab card" role="tabpanel" aria-labelledby="Income" hidden={tab !== 'income'}>
          <h2 className="section-title">Add Income</h2>
          <p className="subtle">Enter your income details. USD value is calculated in real-time using a fixed rate: <strong>1 USD = <span id="rateDisplay1">{rate.toLocaleString()}</span> KRW</strong>.</p>

          <form onSubmit={onAddIncome} noValidate>
            <div className="row">
              <div>
                <label htmlFor="income-date">Date *</label>
                <input ref={incomeDateRef} type="date" id="income-date" required value={incomeForm.date} onChange={(e) => setIncomeForm(f => ({ ...f, date: e.target.value }))} style={{ cursor: 'pointer' }} />
              </div>
              <div>
                <label htmlFor="income-desc">Description</label>
                <input type="text" id="income-desc" placeholder="e.g., Salary (optional)" maxLength={100} value={incomeForm.desc} onChange={(e) => setIncomeForm(f => ({ ...f, desc: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="income-amount">Amount (KRW) *</label>
                <input type="number" id="income-amount" required min={1} step={1} inputMode="numeric" placeholder="e.g., 1500000" value={incomeForm.amount} onChange={(e) => setIncomeForm(f => ({ ...f, amount: e.target.value }))} />
                <div className="field-hint"><span className="convert-chip">USD ≈ <span id="income-usd">{incomeUSD}</span></span></div>
              </div>
              <div>
                <label htmlFor="income-notes">Notes</label>
                <textarea id="income-notes" placeholder="Optional" value={incomeForm.notes} onChange={(e) => setIncomeForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn btn-success" type="submit" disabled={isAddingIncome}>
                {isAddingIncome ? 'Adding...' : 'Add Income'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setIncomeForm(f => ({ date: f.date, desc: "", amount: "", notes: "" }))} disabled={isAddingIncome}>Reset</button>
            </div>
          </form>

          <div className="table-wrap" style={{ marginTop: 18 }}>
            {isLoadingData ? (
              <div className="loading-container">
                <span className="loader"></span>
              </div>
            ) : (
              <table id="income-table" aria-label="Income Records">
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Amount (KRW)</th><th>Amount (USD)</th><th>Notes</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {income.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: '24px' }}>No income records yet. Add your first income above.</td></tr>
                  ) : (
                    [...income].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(row => (
                      <tr key={row.id} style={{ opacity: deletingId === row.id ? 0.5 : 1 }}>
                        <td>{row.date || ""}</td>
                        <td>{row.desc}</td>
                        <td><span className="pill green">{fmtKRW.format(row.amount)}</span></td>
                        <td>{fmtUSD.format(krwToUsd(row.amount, rate))}</td>
                        <td>{row.notes || ""}</td>
                        <td>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => onDelete(row.id, "income")}
                            aria-label="Delete income"
                            disabled={deletingId === row.id}
                          >
                            {deletingId === row.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Expenses Tab */}
        <section id="tab-expenses" className="tab card" role="tabpanel" aria-labelledby="Expenses" hidden={tab !== 'expenses'}>
          <h2 className="section-title">Add Expense</h2>
          <p className="subtle">Track your spending by category. USD value is calculated in real-time using <strong>1 USD = <span id="rateDisplay2">{rate.toLocaleString()}</span> KRW</strong>.</p>

          <form onSubmit={onAddExpense} noValidate>
            <div className="row">
              <div>
                <label htmlFor="expense-date">Date *</label>
                <input ref={expenseDateRef} type="date" id="expense-date" required value={expenseForm.date} onChange={(e) => setExpenseForm(f => ({ ...f, date: e.target.value }))} style={{ cursor: 'pointer' }} />
              </div>
              <div>
                <label htmlFor="expense-category">Category</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select id="expense-category" value={expenseForm.category} onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="">Select a category (optional)</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" className="btn btn-sm" onClick={onAddCategory} aria-label="Add category">Add</button>
                </div>
              </div>
              <div>
                <label htmlFor="expense-desc">Description</label>
                <input type="text" id="expense-desc" placeholder="e.g., Groceries (optional)" maxLength={100} value={expenseForm.desc} onChange={(e) => setExpenseForm(f => ({ ...f, desc: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="expense-amount">Amount (KRW) *</label>
                <input type="number" id="expense-amount" required min={1} step={1} inputMode="numeric" placeholder="e.g., 35000" value={expenseForm.amount} onChange={(e) => setExpenseForm(f => ({ ...f, amount: e.target.value }))} />
                <div className="field-hint"><span className="convert-chip">USD ≈ <span id="expense-usd">{expenseUSD}</span></span></div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="expense-notes">Notes</label>
                <textarea id="expense-notes" placeholder="Optional" value={expenseForm.notes} onChange={(e) => setExpenseForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" type="submit" disabled={isAddingExpense}>
                {isAddingExpense ? 'Adding...' : 'Add Expense'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setExpenseForm(f => ({ date: f.date, category: "", desc: "", amount: "", notes: "" }))} disabled={isAddingExpense}>Reset</button>
            </div>
          </form>

          <div className="table-wrap" style={{ marginTop: 18 }}>
            {isLoadingData ? (
              <div className="loading-container">
                <span className="loader"></span>
              </div>
            ) : (
              <table id="expense-table" aria-label="Expense Records">
                <thead>
                  <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount (KRW)</th><th>Amount (USD)</th><th>Notes</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: '24px' }}>No expense records yet. Add your first expense above.</td></tr>
                  ) : (
                    [...expenses].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(row => (
                      <tr key={row.id} style={{ opacity: deletingId === row.id ? 0.5 : 1 }}>
                        <td>{row.date || ""}</td>
                        <td>{row.category}</td>
                        <td>{row.desc}</td>
                        <td><span className="pill red">{fmtKRW.format(row.amount)}</span></td>
                        <td>{fmtUSD.format(krwToUsd(row.amount, rate))}</td>
                        <td>{row.notes || ""}</td>
                        <td>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => onDelete(row.id, "expense")}
                            aria-label="Delete expense"
                            disabled={deletingId === row.id}
                          >
                            {deletingId === row.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Summary Tab */}
        <section id="tab-summary" className="tab card" role="tabpanel" aria-labelledby="Summary" hidden={tab !== 'summary'}>
          <h2 className="section-title">Summary</h2>
          <p className="subtle">Overview of totals and spending distribution. Data is stored in the database. Use export/import to backup your data.</p>

          <div className="summary-cards">
            <div className="summary-card income-card">
              <h3>Income</h3>
              <div className="big" id="sum-income-krw">{fmtKRW.format(totals.incomeKRW)}</div>
              <div className="sub">≈ <strong id="sum-income-usd">{fmtUSD.format(totals.incomeUSD)}</strong></div>
            </div>
            <div className="summary-card expense-card">
              <h3>Expenses</h3>
              <div className="big" id="sum-expense-krw">{fmtKRW.format(totals.expenseKRW)}</div>
              <div className="sub">≈ <strong id="sum-expense-usd">{fmtUSD.format(totals.expenseUSD)}</strong></div>
            </div>
            <div className="summary-card remain-card">
              <h3>Remaining</h3>
              <div className="big" id="sum-remaining-krw">{fmtKRW.format(totals.remainingKRW)}</div>
              <div className="sub">≈ <strong id="sum-remaining-usd">{fmtUSD.format(totals.remainingUSD)}</strong></div>
            </div>
          </div>

          <div className="currency-boxes">
            <div className="currency-box krw-box">
              <div>KRW Total</div>
              <div className="value" id="currency-krw-box">{fmtKRW.format(totals.remainingKRW)}</div>
            </div>
            <div className="currency-box usd-box">
              <div>USD Total</div>
              <div className="value" id="currency-usd-box">{fmtUSD.format(totals.remainingUSD)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2">
            <div className="card">
              <h2 className="section-title">Expense Category Breakdown</h2>
              <p className="subtle">Percentages are relative to total expenses.</p>
              <div className="table-wrap breakdown">
                <table id="breakdown-table" aria-label="Category Breakdown">
                  <thead><tr><th>Category</th><th>KRW</th><th>%</th></tr></thead>
                  <tbody>
                    {categories.map(cat => {
                      const amt = breakdown[cat] || 0;
                      const pct = (amt / (totals.expenseKRW || 1)) * 100;
                      return (
                        <tr key={cat}>
                          <td>{cat}</td>
                          <td>{fmtKRW.format(amt)}</td>
                          <td style={{ minWidth: 180 }}>
                            <div className="bar" title={`${pct.toFixed(1)}%`}><span style={{ width: `${pct.toFixed(2)}%` }}></span></div>
                            <div className="subtle">{pct.toFixed(1)}%</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <h2 className="section-title">Data Controls</h2>
              <p className="subtle">Export your data to a JSON file or import it back later. Clearing data cannot be undone.</p>
              <div className="actions" style={{ marginTop: 12 }}>
                <button className="btn" onClick={exportJSON}>Export JSON</button>
                <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={onFilePicked} />
                <button className="btn" onClick={importJSONFromPicker}>Import JSON</button>
                <button className="btn btn-danger" onClick={clearAll}>Clear All Data</button>
              </div>
              <p className="subtle" style={{ marginTop: 12 }}>Import replaces existing data after confirmation. Expected format: {"{ rate, income:[...], expenses:[...], categories:[...] }"}.</p>
            </div>
          </div>
        </section>
      </main>

      <div className="toasts" aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>

      {/* <footer>
        <div className="muted">Made for fast, reliable personal budgeting. Data stored securely in the cloud. Fixed rate: 1 USD = {rate.toLocaleString()} KRW.</div>
      </footer> */}

    </>
  );
}
