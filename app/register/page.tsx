'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('budget_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('budget_theme', newTheme);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
      } else {
        router.push('/login?registered=true');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const isDark = theme === 'dark';

  return (
    <div className="auth-container" data-theme={theme}>
      <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
        {isDark ? '☀️' : '🌙'}
      </button>
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand">
            <span className="dot"></span> Budget Tracker
          </div>
          <h1>Create Account</h1>
          <p>Start tracking your finances today</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="name">Name (optional)</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: ${isDark ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' : 'linear-gradient(135deg, #f0f9ff 0%, #faf5ff 50%, #f8fafc 100%)'};
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
          transition: background 0.3s ease;
          position: relative;
        }

        .theme-toggle {
          position: absolute;
          top: 20px;
          right: 20px;
          appearance: none;
          border: none;
          background: ${isDark ? 'linear-gradient(180deg, #111827, #0b1220)' : 'linear-gradient(180deg, #ffffff, #f8fafc)'};
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          border-radius: 50%;
          width: 44px;
          height: 44px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .theme-toggle:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .auth-card {
          background: ${isDark ? '#1e1e2f' : '#ffffff'};
          border-radius: 16px;
          padding: 40px;
          width: 100%;
          max-width: 400px;
          box-shadow: ${isDark ? '0 10px 40px rgba(0, 0, 0, 0.3)' : '0 10px 40px rgba(0, 0, 0, 0.1)'};
          transition: background 0.3s ease, box-shadow 0.3s ease;
        }

        @media (max-width: 480px) {
          .auth-card {
            padding: 24px 20px;
            border-radius: 12px;
          }
          .auth-header h1 {
            font-size: 1.5rem;
          }
        }

        .auth-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .brand {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 1.25rem;
          font-weight: 600;
          color: ${isDark ? '#fff' : '#1e293b'};
          margin-bottom: 16px;
        }

        .dot {
          width: 12px;
          height: 12px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 50%;
        }

        .auth-header h1 {
          color: ${isDark ? '#fff' : '#1e293b'};
          font-size: 1.75rem;
          margin: 0 0 8px 0;
        }

        .auth-header p {
          color: ${isDark ? '#9ca3af' : '#64748b'};
          margin: 0;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .auth-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: ${isDark ? '#f87171' : '#dc2626'};
          padding: 12px;
          border-radius: 8px;
          font-size: 0.875rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          color: ${isDark ? '#e5e7eb' : '#374151'};
          font-size: 0.875rem;
          font-weight: 500;
        }

        .form-group input {
          padding: 12px 16px;
          background: ${isDark ? '#2a2a3c' : '#f8fafc'};
          border: 1px solid ${isDark ? '#3f3f5a' : '#e2e8f0'};
          border-radius: 8px;
          color: ${isDark ? '#fff' : '#1e293b'};
          font-size: 1rem;
          transition: border-color 0.2s, background 0.3s ease;
        }

        .form-group input:focus {
          outline: none;
          border-color: #6366f1;
        }

        .form-group input::placeholder {
          color: ${isDark ? '#6b7280' : '#9ca3af'};
        }

        .form-group input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-block {
          width: 100%;
          padding: 14px;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-footer {
          margin-top: 24px;
          text-align: center;
        }

        .auth-footer p {
          color: ${isDark ? '#9ca3af' : '#64748b'};
          margin: 0;
        }

        .auth-footer a {
          color: #6366f1;
          text-decoration: none;
          font-weight: 500;
        }

        .auth-footer a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
