import React, { useState } from 'react';
import { Eye, EyeOff, PawPrint, UserPlus } from 'lucide-react';
import { api } from '../api';

export function RegisterPage({ onRegistered, onGoLogin }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    phone: '',
    address: '',
    housing_type: 'apartment',
    has_yard: false,
    has_other_pets: false,
    has_children: false,
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.full_name.trim().length < 2) {
      setError('Full name must be at least 2 characters.');
      return;
    }
    if (form.password !== form.confirm_password) {
      setError('Password and confirmation password do not match.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters and include upper, lower, digit, and special character.');
      return;
    }

    setLoading(true);
    try {
      await api.register({
        ...form,
        phone: form.phone.trim() || 'Not provided',
        address: form.address.trim() || 'Not provided',
      });
      onRegistered('Registration successful! Please sign in with your new adopter account.');
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 920 }}>
        <div className="auth-hero">
          <div className="auth-badge">
            <PawPrint size={20} /> Adopter Registration
          </div>
          <h1>Join PawHaven</h1>
          <p>
            Create your adopter account to browse available animals, view vaccination and medical readiness, apply for adoption, and download official certificates.
          </p>
          <div className="auth-highlights">
            <div>Public registration creates an <strong>ADOPTER</strong> account.</div>
            <div>Staff and Admin accounts are provisioned by a Shelter Administrator.</div>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem' }}>Create Adopter Account</h2>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
            Password requires 8+ chars with uppercase, lowercase, number, and symbol.
          </p>

          {error && <div className="alert-banner alert-danger">{error}</div>}

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="reg-name">Full Name *</label>
              <input
                id="reg-name"
                className="input"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="e.g. Ananya Verma"
              />
            </div>
            <div className="form-field">
              <label htmlFor="reg-email">Email Address *</label>
              <input
                id="reg-email"
                type="email"
                className="input"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
              />
            </div>

            <div className="form-field">
              <label htmlFor="reg-password">Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-password"
                  type={showPass ? 'text' : 'password'}
                  className="input"
                  style={{ width: '100%', paddingRight: 40 }}
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Strong password"
                />
                <button
                  type="button"
                  className="icon-toggle"
                  onClick={() => setShowPass((s) => !s)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="reg-confirm">Confirm Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  className="input"
                  style={{ width: '100%', paddingRight: 40 }}
                  required
                  value={form.confirm_password}
                  onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                  placeholder="Re-enter password"
                />
                <button
                  type="button"
                  className="icon-toggle"
                  onClick={() => setShowConfirm((s) => !s)}
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="reg-phone">Phone Number</label>
              <input
                id="reg-phone"
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91-9800000000"
              />
            </div>

            <div className="form-field">
              <label htmlFor="reg-housing">Housing Type</label>
              <select
                id="reg-housing"
                className="select"
                value={form.housing_type}
                onChange={(e) => setForm({ ...form, housing_type: e.target.value })}
              >
                <option value="apartment">Apartment</option>
                <option value="house">House</option>
                <option value="condo">Condo</option>
                <option value="farm">Farm</option>
              </select>
            </div>
          </div>

          <div className="form-field" style={{ marginTop: 12 }}>
            <label htmlFor="reg-address">Residential Address</label>
            <input
              id="reg-address"
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Street, City"
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10, marginBottom: 18 }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.has_yard}
                onChange={(e) => setForm({ ...form, has_yard: e.target.checked })}
              />
              Fenced Yard
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.has_other_pets}
                onChange={(e) => setForm({ ...form, has_other_pets: e.target.checked })}
              />
              Have Other Pets
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.has_children}
                onChange={(e) => setForm({ ...form, has_children: e.target.checked })}
              />
              Children at Home
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
            disabled={loading}
          >
            <UserPlus size={16} /> {loading ? 'Creating Account...' : 'Register as Adopter'}
          </button>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <button type="button" className="link-btn" onClick={onGoLogin}>
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
