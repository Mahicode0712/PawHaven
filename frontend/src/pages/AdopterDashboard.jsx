import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Eye, Heart, PawPrint, Save, Sparkles } from 'lucide-react';
import { api } from '../api';
import { Modal } from '../components/Modal';
import { CertificateModal } from '../components/CertificateModal';

const APP_BADGE = {
  submitted: 'badge-neutral',
  under_review: 'badge-info',
  home_check: 'badge-warning',
  approved: 'badge-success',
  completed: 'badge-success',
  rejected: 'badge-danger',
  withdrawn: 'badge-neutral',
};

export function AdopterDashboard({ activeSection, onNavigate, refreshTick, onChanged }) {
  const [dash, setDash] = useState(null);
  const [animals, setAnimals] = useState([]);
  const [matches, setMatches] = useState([]);
  const [profile, setProfile] = useState(null);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [certPlacementId, setCertPlacementId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const loadAll = () => {
    Promise.all([
      api.getAdopterDashboard(),
      api.getAnimals(),
      api.getMatchmaking(),
      api.getMyProfile(),
    ])
      .then(([d, a, m, p]) => {
        setDash(d);
        setAnimals(a);
        setMatches(m);
        setProfile(p);
      })
      .catch((err) => setFeedback({ type: 'danger', text: err.message }));
  };

  useEffect(() => {
    loadAll();
  }, [refreshTick]);

  const handleApply = async (animal) => {
    setFeedback({ type: '', text: '' });
    try {
      const app = await api.createApplication({
        animal_id: animal.id,
        reviewer_notes: `Submitted via Adopter Portal for ${animal.name}`,
      });
      setFeedback({
        type: 'success',
        text: `Application ${app.application_code} submitted for ${animal.name}!`,
      });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleWithdraw = async (appId) => {
    setFeedback({ type: '', text: '' });
    try {
      const updated = await api.updateApplicationStatus(appId, {
        status: 'withdrawn',
        reviewer_notes: 'Withdrawn by adopter',
      });
      setFeedback({ type: 'success', text: `Application ${updated.application_code} withdrawn.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', text: '' });
    try {
      const updated = await api.updateMyProfile({
        phone: profile.phone,
        address: profile.address,
        housing_type: profile.housing_type,
        has_yard: Boolean(profile.has_yard),
        has_other_pets: Boolean(profile.has_other_pets),
        has_children: Boolean(profile.has_children),
      });
      setProfile(updated);
      setFeedback({ type: 'success', text: 'Your adopter household profile has been updated.' });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  if (!dash) return <div className="card">Loading your Adopter Portal...</div>;

  const matchByAnimal = Object.fromEntries(matches.map((m) => [m.animal_id, m]));

  return (
    <div>
      {feedback.text && <div className={`alert-banner alert-${feedback.type}`}>{feedback.text}</div>}

      {activeSection === 'dashboard' && (
        <div>
          <div className="page-header">
            <div>
              <h1 className="page-title">Adopter Dashboard</h1>
              <p className="page-subtitle">
                Browse adoptable companions, track your application progress, view certificates, and review follow-up schedules
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => onNavigate('browse-pets')}>
              <PawPrint size={16} /> Browse Available Pets
            </button>
          </div>

          <div className="kpi-grid">
            <div className="card kpi-card">
              <span className="kpi-label">Available Pets</span>
              <span className="kpi-value" style={{ color: 'var(--primary)' }}>{dash.kpis.available_pets}</span>
              <span className="kpi-meta">Ready or in matching</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">My Active Applications</span>
              <span className="kpi-value" style={{ color: '#2563eb' }}>{dash.kpis.active_applications}</span>
              <span className="kpi-meta">{dash.applications.length} total submitted</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">My Adopted Pets</span>
              <span className="kpi-value" style={{ color: '#059669' }}>{dash.kpis.completed_adoptions}</span>
              <span className="kpi-meta">Official certificates issued</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Upcoming Follow-Ups</span>
              <span className="kpi-value" style={{ color: '#d97706' }}>{dash.kpis.pending_followups}</span>
              <span className="kpi-meta">Post-adoption check-ins</span>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="section-title">
                <span>My Recent Applications</span>
                <button className="btn btn-sm" onClick={() => onNavigate('my-applications')}>
                  View All
                </button>
              </div>
              {dash.applications.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  You haven't submitted an adoption application yet. Browse available pets to get started!
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Code</th><th>Pet</th><th>Status</th><th>Updated</th></tr>
                    </thead>
                    <tbody>
                      {dash.applications.slice(0, 5).map((app) => (
                        <tr key={app.id}>
                          <td><strong>{app.application_code}</strong></td>
                          <td>{app.animal_name} ({app.species_name})</td>
                          <td>
                            <span className={`badge ${APP_BADGE[app.status] || 'badge-neutral'}`}>
                              {app.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{app.updated_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {profile && (
              <div className="card">
                <div className="section-title"><span>My Household Profile</span></div>
                <form onSubmit={handleSaveProfile}>
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Phone</label>
                      <input
                        className="input"
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      />
                    </div>
                    <div className="form-field">
                      <label>Housing Type</label>
                      <select
                        className="select"
                        value={profile.housing_type}
                        onChange={(e) => setProfile({ ...profile, housing_type: e.target.value })}
                      >
                        <option value="apartment">Apartment</option>
                        <option value="house">House</option>
                        <option value="condo">Condo</option>
                        <option value="farm">Farm</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-field" style={{ marginTop: 10 }}>
                    <label>Address</label>
                    <input
                      className="input"
                      value={profile.address}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={Boolean(profile.has_yard)}
                        onChange={(e) => setProfile({ ...profile, has_yard: e.target.checked })}
                      />
                      Yard
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={Boolean(profile.has_other_pets)}
                        onChange={(e) => setProfile({ ...profile, has_other_pets: e.target.checked })}
                      />
                      Other Pets
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={Boolean(profile.has_children)}
                        onChange={(e) => setProfile({ ...profile, has_children: e.target.checked })}
                      />
                      Children
                    </label>
                  </div>
                  <button type="submit" className="btn btn-sm btn-primary" style={{ marginTop: 14 }}>
                    <Save size={14} /> Update Profile
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSection === 'browse-pets' && (
        <div>
          <div className="page-header">
            <div>
              <h1 className="page-title">Available Pets & Compatibility</h1>
              <p className="page-subtitle">
                Inspect pet profiles, vaccination compliance, and personalized match scores before applying
              </p>
            </div>
          </div>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pet</th>
                  <th>Species & Breed</th>
                  <th>Age / Weight</th>
                  <th>Medical / Vaccines</th>
                  <th>Match Score</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {animals
                  .filter((a) => a.adoption_status !== 'adopted')
                  .map((a) => {
                    const match = matchByAnimal[a.id];
                    return (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.microchip_id}</div>
                        </td>
                        <td>{a.species_name} • {a.breed_name}</td>
                        <td>{a.age_months}m • {a.weight_kg} kg</td>
                        <td>
                          {a.adoption_ready ? (
                            <span className="badge badge-success">Medically Cleared</span>
                          ) : (
                            <span className="badge badge-warning">Pending Clearance</span>
                          )}
                        </td>
                        <td>
                          {match ? (
                            <span className="badge badge-info">
                              <Sparkles size={12} /> {match.priority_score}/100
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <span className={`badge ${a.adoption_status === 'available' ? 'badge-success' : 'badge-info'}`}>
                            {a.adoption_status.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn btn-sm"
                              onClick={() => api.getAnimalDetail(a.id).then(setSelectedAnimal)}
                            >
                              <Eye size={13} /> Details
                            </button>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleApply(a)}
                            >
                              <Heart size={13} /> Apply
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSection === 'my-applications' && (
        <div>
          <div className="page-header">
            <div>
              <h1 className="page-title">My Applications, Certificates & Follow-Ups</h1>
              <p className="page-subtitle">
                Private view of your adoption applications, issued certificates, and post-adoption check-in schedule
              </p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title"><span>My Adoption Applications</span></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Animal</th>
                    <th>Home Check</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.applications.map((app) => (
                    <tr key={app.id}>
                      <td><strong>{app.application_code}</strong></td>
                      <td>{app.animal_name} ({app.breed_name})</td>
                      <td>{app.home_check_passed ? 'Passed' : 'Pending'}</td>
                      <td>
                        <span className={`badge ${APP_BADGE[app.status] || 'badge-neutral'}`}>
                          {app.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{app.reviewer_notes}</td>
                      <td>
                        {['submitted', 'under_review', 'home_check'].includes(app.status) && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleWithdraw(app.id)}>
                            Withdraw
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {dash.applications.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No applications yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="section-title"><span>My Adoption Certificates</span></div>
              {dash.placements.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  Certificates appear here once an approved adoption is finalized.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr><th>Certificate</th><th>Pet</th><th>Date</th><th>View</th></tr>
                  </thead>
                  <tbody>
                    {dash.placements.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.certificate_number}</strong></td>
                        <td>{p.animal_name}</td>
                        <td>{p.adoption_date}</td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={() => setCertPlacementId(p.id)}>
                            <Award size={13} /> Certificate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <div className="section-title"><span>My Post-Adoption Follow-Ups</span></div>
              {dash.followups.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  No scheduled follow-ups yet.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr><th>Date</th><th>Pet</th><th>Type</th><th>Wellbeing</th></tr>
                  </thead>
                  <tbody>
                    {dash.followups.map((f) => (
                      <tr key={f.id}>
                        <td>{f.scheduled_date}</td>
                        <td>{f.animal_name}</td>
                        <td>{f.followup_type.replaceAll('_', ' ')}</td>
                        <td>
                          <span className={`badge ${f.animal_wellbeing === 'thriving' ? 'badge-success' : f.animal_wellbeing === 'pending' ? 'badge-warning' : 'badge-info'}`}>
                            <CheckCircle2 size={11} /> {f.animal_wellbeing}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedAnimal && (
        <Modal title={`${selectedAnimal.name} — Pet & Vaccination Profile`} onClose={() => setSelectedAnimal(null)} wide>
          <div className="cert-grid">
            <div className="cert-box">
              <div><strong>Microchip:</strong> {selectedAnimal.microchip_id}</div>
              <div><strong>Species / Breed:</strong> {selectedAnimal.species_name} / {selectedAnimal.breed_name}</div>
              <div><strong>Age / Gender:</strong> {selectedAnimal.age_months}m • {selectedAnimal.gender}</div>
              <div><strong>Spayed / Neutered:</strong> {selectedAnimal.spayed_neutered ? 'Yes' : 'No'}</div>
            </div>
            <div className="cert-box">
              <div><strong>Good with Kids:</strong> {selectedAnimal.good_with_kids ? 'Yes' : 'No'}</div>
              <div><strong>Good with Other Pets:</strong> {selectedAnimal.good_with_pets ? 'Yes' : 'No'}</div>
              <div><strong>Medical Status:</strong> {selectedAnimal.medical_status}</div>
              <div><strong>Adoption Ready:</strong> {selectedAnimal.readiness.ready ? 'Yes' : 'Pending'}</div>
            </div>
          </div>
          <h4>Vaccination Summary</h4>
          <table>
            <thead><tr><th>Vaccine</th><th>Administered</th><th>Next Due</th><th>Status</th></tr></thead>
            <tbody>
              {selectedAnimal.vaccinations.map((v) => (
                <tr key={v.id}>
                  <td>{v.vaccine_name}</td>
                  <td>{v.administered_date}</td>
                  <td>{v.next_due_date}</td>
                  <td><span className={`badge ${v.status === 'valid' ? 'badge-success' : 'badge-warning'}`}>{v.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {certPlacementId && (
        <CertificateModal placementId={certPlacementId} onClose={() => setCertPlacementId(null)} />
      )}
    </div>
  );
}
