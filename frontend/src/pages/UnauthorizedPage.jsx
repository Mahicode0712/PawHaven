import React from 'react';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export function UnauthorizedPage({ role, onReturn }) {
  return (
    <div className="card" style={{ maxWidth: 580, margin: '48px auto', textAlign: 'center', padding: 36 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--danger-soft)',
          color: 'var(--danger)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <ShieldAlert size={28} />
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.5rem' }}>Unauthorized Access (403)</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 22px' }}>
        Your current role (<strong>{role || 'Guest'}</strong>) does not have permission to view this section.
        All protected endpoints and views are enforced on both backend and frontend.
      </p>
      <button className="btn btn-primary" onClick={onReturn}>
        <ArrowLeft size={16} /> Return to My Dashboard
      </button>
    </div>
  );
}
