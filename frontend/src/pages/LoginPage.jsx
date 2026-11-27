import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, PawPrint, ShieldCheck } from 'lucide-react';
import { api } from '../api';

export function LoginPage({ onLoginSuccess, onGoRegister, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login({ email: email.trim(), password, remember_me: rememberMe });
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-hero">
          <div className="auth-badge">
            <PawPrint size={20} /> PawHaven Animal Welfare
          </div>
          <h1>Welcome Back</h1>
          <p>
            Sign in to access shelter operations, veterinary care records, adoption approvals, or your adopter portal.
          </p>
          <div className="auth-highlights">
            <div><ShieldCheck size={15} /> HttpOnly Session & CSRF Protection</div>
            <div><ShieldCheck size={15} /> Role-Based Access: Admin, Staff & Adopter</div>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem' }}>Sign In</h2>
          <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Enter your credentials to continue to your dashboard.
          </p>

          {notice && <div className="alert-banner alert-success">{notice}</div>}
          {error && <div className="alert-banner alert-danger">{error}</div>}

          <div className="form-field" style={{ marginBottom: 14 }}>
            <label htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              className="input"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="form-field" style={{ marginBottom: 12 }}>
            <label htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="input"
                style={{ width: '100%', paddingRight: 40 }}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="icon-toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <label className="checkbox-row" style={{ marginBottom: 18 }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Keep me signed in for 7 days
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
            disabled={loading}
          >
            <LogIn size={16} /> {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Looking to adopt a pet?{' '}
            <button type="button" className="link-btn" onClick={onGoRegister}>
              Create an Adopter Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
