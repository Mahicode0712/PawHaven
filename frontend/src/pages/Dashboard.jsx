import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { api } from '../api';

const STATUS_BADGE = {
  submitted: 'badge-neutral',
  under_review: 'badge-info',
  home_check: 'badge-warning',
  approved: 'badge-success',
  completed: 'badge-success',
  rejected: 'badge-danger',
  withdrawn: 'badge-neutral',
};

export function Dashboard({ userRole, refreshTick, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getDashboard()
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err) => setError(err.message));
  }, [refreshTick]);

  if (error) return <div className="alert-banner alert-danger">{error}</div>;
  if (!data) return <div className="card">Loading Shelter Command Center...</div>;

  const { kpis, zone_occupancy, recent_applications, upcoming_followups } = data;
  const highOccZones = zone_occupancy.filter((z) => z.occupied / z.max_capacity >= 0.8);
  const isAdmin = userRole === 'ADMIN';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isAdmin ? 'Admin Shelter Command Center' : 'Shelter Staff Operations Dashboard'}
          </h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Full administrative oversight: shelter occupancy, staff & user accounts, medical care, adoptions, and reports'
              : 'Daily operations: animal intake, medical & vaccine care, kennel occupancy, adoption reviews, and follow-ups'}
          </p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          {isAdmin && (
            <button className="btn" onClick={() => onNavigate('admin-users')}>
              Manage Users & Staff
            </button>
          )}
          <button className="btn" onClick={() => onNavigate('reports')}>
            Generate Reports <ArrowRight size={15} />
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('animals')}>
            Admit / View Animals
          </button>
        </div>
      </div>

      {kpis.overdue_vaccines > 0 && (
        <div className="alert-banner alert-danger">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={18} />
            <span>
              <strong>Health Alert:</strong> {kpis.overdue_vaccines} animal vaccination booster(s) are overdue and{' '}
              {kpis.due_soon_vaccines} booster(s) are due within 14 days.
            </span>
          </div>
          <button className="btn btn-sm btn-danger" onClick={() => onNavigate('medical')}>
            Review Vaccines
          </button>
        </div>
      )}

      {highOccZones.length > 0 && (
        <div className="alert-banner alert-warning">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} />
            <span>
              <strong>Capacity Warning:</strong>{' '}
              {highOccZones.map((z) => `${z.zone_code} (${z.occupied}/${z.max_capacity})`).join(', ')} nearing full capacity.
            </span>
          </div>
          <button className="btn btn-sm" onClick={() => onNavigate('reports')}>
            Occupancy Report
          </button>
        </div>
      )}

      <div className="kpi-grid">
        <div className="card kpi-card">
          <span className="kpi-label">Active Shelter Occupancy</span>
          <span className="kpi-value">
            {kpis.total_in_shelter} / {kpis.total_capacity}
          </span>
          <span className="kpi-meta">{kpis.occupancy_pct}% kennel capacity utilized</span>
        </div>

        <div className="card kpi-card">
          <span className="kpi-label">Ready for Adoption</span>
          <span className="kpi-value" style={{ color: '#059669' }}>
            {kpis.available_for_adoption}
          </span>
          <span className="kpi-meta">
            {kpis.pending_adoption} pending • {kpis.in_quarantine} in quarantine
          </span>
        </div>

        <div className="card kpi-card">
          <span className="kpi-label">Active Applications</span>
          <span className="kpi-value" style={{ color: '#2563eb' }}>
            {kpis.pending_applications}
          </span>
          <span className="kpi-meta">{kpis.total_adopted} total successful adoptions</span>
        </div>

        <div className="card kpi-card">
          <span className="kpi-label">Pending Follow-Ups</span>
          <span className="kpi-value" style={{ color: '#d97706' }}>
            {kpis.pending_followups}
          </span>
          <span className="kpi-meta">7, 30 & 90-day post-adoption welfare checks</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title">
            <span>Shelter Zone Capacity</span>
            <button className="btn btn-sm" onClick={() => onNavigate('animals')}>
              Manage Zones
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {zone_occupancy.map((z) => {
              const pct = Math.round((z.occupied / z.max_capacity) * 100);
              const color = pct >= 85 ? '#dc2626' : pct >= 65 ? '#d97706' : '#0f5c4d';
              return (
                <div key={z.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem' }}>
                    <span>
                      <strong>{z.zone_code}</strong> — {z.zone_name} ({z.species_name})
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {z.occupied} / {z.max_capacity} ({pct}%)
                    </span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <span>Recent Adoption Applications</span>
            <button className="btn btn-sm" onClick={() => onNavigate('adoptions')}>
              Open Pipeline
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Animal</th>
                  <th>Adopter</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent_applications.map((app) => (
                  <tr key={app.id}>
                    <td><strong>{app.application_code}</strong></td>
                    <td>{app.animal_name}</td>
                    <td>{app.adopter_name}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[app.status] || 'badge-neutral'}`}>
                        {app.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">
          <span>Upcoming Post-Adoption Welfare Follow-Ups</span>
          <button className="btn btn-sm" onClick={() => onNavigate('adoptions')}>
            Record Follow-Up
          </button>
        </div>
        {upcoming_followups.length === 0 ? (
          <div style={{ color: '#5a6c63', fontSize: '0.9rem' }}>
            <CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            All scheduled post-adoption follow-ups are complete!
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Scheduled Date</th>
                  <th>Check Type</th>
                  <th>Animal</th>
                  <th>Adopter</th>
                  <th>Certificate</th>
                </tr>
              </thead>
              <tbody>
                {upcoming_followups.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Clock size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                      {f.scheduled_date}
                    </td>
                    <td><span className="badge badge-warning">{f.followup_type.replaceAll('_', ' ')}</span></td>
                    <td><strong>{f.animal_name}</strong></td>
                    <td>{f.adopter_name}</td>
                    <td>{f.certificate_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
