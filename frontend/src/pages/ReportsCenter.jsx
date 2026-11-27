import React, { useEffect, useState } from 'react';
import { Award, Building2, Download, HeartPulse, Printer } from 'lucide-react';
import { api } from '../api';
import { CertificateModal } from '../components/CertificateModal';

function downloadCsv(filename, headers, rows) {
  const escape = (val) => `"${String(val ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsCenter({ refreshTick }) {
  const [reportTab, setReportTab] = useState('certificates');
  const [placements, setPlacements] = useState([]);
  const [occupancy, setOccupancy] = useState(null);
  const [health, setHealth] = useState(null);
  const [certPlacementId, setCertPlacementId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getPlacements(), api.getOccupancyReport(), api.getHealthReport()])
      .then(([p, o, h]) => {
        setPlacements(p);
        setOccupancy(o);
        setHealth(h);
        setError('');
      })
      .catch((err) => setError(err.message));
  }, [refreshTick]);

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Reports & Official Certificates</h1>
          <p className="page-subtitle">
            Generate printable Adoption Certificates, Shelter Occupancy Reports, and Animal Health & Vaccination Compliance Reports
          </p>
        </div>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} /> Print Current Report
        </button>
      </div>

      {error && <div className="alert-banner alert-danger">{error}</div>}

      <div className="tabs no-print">
        <button className={`tab-btn ${reportTab === 'certificates' ? 'active' : ''}`} onClick={() => setReportTab('certificates')}>
          <Award size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          Adoption Certificates ({placements.length})
        </button>
        <button className={`tab-btn ${reportTab === 'occupancy' ? 'active' : ''}`} onClick={() => setReportTab('occupancy')}>
          <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          Shelter Occupancy Report
        </button>
        <button className={`tab-btn ${reportTab === 'health' ? 'active' : ''}`} onClick={() => setReportTab('health')}>
          <HeartPulse size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          Animal Health Report
        </button>
      </div>

      {reportTab === 'certificates' && (
        <div className="card table-wrap">
          <div className="section-title">
            <span>Issued Adoption Certificates</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Certificate No.</th>
                <th>Adoption Date</th>
                <th>Animal</th>
                <th>Adopter</th>
                <th>Fee Paid</th>
                <th>Issued By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {placements.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.certificate_number}</strong></td>
                  <td>{p.adoption_date}</td>
                  <td>{p.animal_name} ({p.species_name} • {p.microchip_id})</td>
                  <td>
                    <div>{p.adopter_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#5a6c63' }}>{p.adopter_email}</div>
                  </td>
                  <td>₹{Number(p.adoption_fee).toFixed(2)}</td>
                  <td>{p.issued_by}</td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={() => setCertPlacementId(p.id)}>
                      <Award size={13} /> Open Certificate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportTab === 'occupancy' && occupancy && (
        <div>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <span className="kpi-label">Total Shelter Capacity</span>
              <span className="kpi-value">{occupancy.summary.total_capacity}</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Occupied Slots</span>
              <span className="kpi-value">{occupancy.summary.total_occupied}</span>
              <span className="kpi-meta">{occupancy.summary.overall_occupancy_pct}% utilized</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Available Slots</span>
              <span className="kpi-value" style={{ color: '#059669' }}>{occupancy.summary.total_available_slots}</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Avg Length of Stay</span>
              <span className="kpi-value">{occupancy.summary.avg_length_of_stay_days}d</span>
              <span className="kpi-meta">Generated {occupancy.generated_at}</span>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">
              <span>Zone-by-Zone Capacity Breakdown</span>
              <button
                className="btn btn-sm no-print"
                onClick={() =>
                  downloadCsv(
                    `shelter-occupancy-${occupancy.generated_at}.csv`,
                    ['Zone Code', 'Zone Name', 'Species', 'Care Level', 'Max Capacity', 'Occupied', 'Available', 'Occupancy %'],
                    occupancy.zones.map((z) => [
                      z.zone_code,
                      z.zone_name,
                      z.species_name,
                      z.care_level,
                      z.max_capacity,
                      z.occupied_slots,
                      z.available_slots,
                      z.occupancy_pct,
                    ])
                  )
                }
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Species</th>
                    <th>Care Level</th>
                    <th>Max Cap</th>
                    <th>Occupied</th>
                    <th>Available</th>
                    <th>Pending / Hold</th>
                    <th>Occupancy %</th>
                  </tr>
                </thead>
                <tbody>
                  {occupancy.zones.map((z) => (
                    <tr key={z.id}>
                      <td><strong>{z.zone_code}</strong> — {z.zone_name}</td>
                      <td>{z.species_name}</td>
                      <td>{z.care_level.replace('_', ' ')}</td>
                      <td>{z.max_capacity}</td>
                      <td>{z.occupied_slots}</td>
                      <td>{z.available_slots}</td>
                      <td>{z.pending_pets} pending / {z.medical_hold_pets} hold</td>
                      <td>
                        <span className={`badge ${z.capacity_alert ? 'badge-danger' : 'badge-success'}`}>
                          {z.occupancy_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="section-title"><span>Species Census</span></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Species</th><th>Currently In Care</th><th>Total Adopted</th></tr>
                </thead>
                <tbody>
                  {occupancy.species_breakdown.map((sp) => (
                    <tr key={sp.species_name}>
                      <td><strong>{sp.species_name}</strong></td>
                      <td>{sp.active_count}</td>
                      <td>{sp.adopted_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {reportTab === 'health' && health && (
        <div>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <span className="kpi-label">Total Active/Adopted</span>
              <span className="kpi-value">{health.summary.total_animals}</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Medically Cleared</span>
              <span className="kpi-value" style={{ color: '#059669' }}>{health.summary.medically_cleared}</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Quarantine / Treatment</span>
              <span className="kpi-value" style={{ color: '#d97706' }}>
                {health.summary.in_quarantine + health.summary.in_treatment_or_critical}
              </span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Overdue Vaccines</span>
              <span className="kpi-value" style={{ color: '#dc2626' }}>
                {health.summary.animals_with_overdue_vaccines}
              </span>
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              <span>Animal Health & Vaccination Compliance Matrix (as of {health.generated_at})</span>
              <button
                className="btn btn-sm no-print"
                onClick={() =>
                  downloadCsv(
                    `animal-health-report-${health.generated_at}.csv`,
                    ['Microchip', 'Name', 'Species', 'Breed', 'Medical Status', 'Quarantine Until', 'Mandatory Vax', 'Overdue', 'Adoption Ready'],
                    health.animals.map((a) => [
                      a.microchip_id,
                      a.name,
                      a.species_name,
                      a.breed_name,
                      a.medical_status,
                      a.quarantine_until,
                      `${a.mandatory_vaccines_valid}/${a.mandatory_vaccines_total}`,
                      a.overdue_doses,
                      a.adoption_ready ? 'Yes' : 'No',
                    ])
                  )
                }
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Microchip / Name</th>
                    <th>Species / Breed</th>
                    <th>Medical Status</th>
                    <th>Quarantine</th>
                    <th>Mandatory Vaccines</th>
                    <th>Due Soon / Overdue</th>
                    <th>Latest Vet Exam</th>
                    <th>Readiness</th>
                  </tr>
                </thead>
                <tbody>
                  {health.animals.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#5a6c63' }}>{a.microchip_id}</div>
                      </td>
                      <td>{a.species_name} • {a.breed_name}</td>
                      <td>
                        <span className={`badge ${a.medical_status === 'cleared' ? 'badge-success' : 'badge-warning'}`}>
                          {a.medical_status}
                        </span>
                      </td>
                      <td>
                        {a.quarantine_active ? (
                          <span className="badge badge-warning">Until {a.quarantine_until}</span>
                        ) : (
                          <span className="badge badge-success">Completed</span>
                        )}
                      </td>
                      <td>{a.mandatory_vaccines_valid} / {a.mandatory_vaccines_total}</td>
                      <td>
                        {a.overdue_doses > 0 ? (
                          <span className="badge badge-danger">{a.overdue_doses} Overdue</span>
                        ) : a.due_soon_doses > 0 ? (
                          <span className="badge badge-warning">{a.due_soon_doses} Due Soon</span>
                        ) : (
                          <span className="badge badge-success">Up to Date</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {a.last_exam ? `${a.last_exam.visit_date}: ${a.last_exam.diagnosis}` : 'No exam logged'}
                      </td>
                      <td>
                        {a.adoption_ready ? (
                          <span className="badge badge-success">Ready</span>
                        ) : (
                          <span className="badge badge-neutral" title={a.readiness_blockers.join('\n')}>
                            {a.adoption_status === 'adopted' ? 'Adopted' : 'Not Ready'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {certPlacementId && (
        <CertificateModal placementId={certPlacementId} onClose={() => setCertPlacementId(null)} />
      )}
    </div>
  );
}
