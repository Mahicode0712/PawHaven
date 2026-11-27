import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, ClipboardList, Plus, Sparkles, UserPlus } from 'lucide-react';
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

const WELLBEING_BADGE = {
  pending: 'badge-warning',
  thriving: 'badge-success',
  adjusting: 'badge-info',
  needs_support: 'badge-danger',
  returned: 'badge-danger',
};

export function AdoptionsAndFollowups({ refreshTick, onChanged }) {
  const [subTab, setSubTab] = useState('applications');
  const [applications, setApplications] = useState([]);
  const [adopters, setAdopters] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [matches, setMatches] = useState([]);
  const [matchAdopterId, setMatchAdopterId] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const [showNewApp, setShowNewApp] = useState(false);
  const [showNewAdopter, setShowNewAdopter] = useState(false);
  const [finalizeTarget, setFinalizeTarget] = useState(null);
  const [followupTarget, setFollowupTarget] = useState(null);
  const [certPlacementId, setCertPlacementId] = useState(null);

  const [appForm, setAppForm] = useState({ adopter_id: '', animal_id: '', reviewer_notes: '' });
  const [adopterForm, setAdopterForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    housing_type: 'house',
    has_yard: true,
    has_other_pets: false,
    has_children: false,
  });
  const [finForm, setFinForm] = useState({
    adoption_date: new Date().toISOString().slice(0, 10),
    adoption_fee: 2000,
    issued_by: 'Sneha Kulkarni (Shelter Director)',
  });
  const [fuForm, setFuForm] = useState({
    completed_date: new Date().toISOString().slice(0, 10),
    animal_wellbeing: 'thriving',
    notes: '',
    conducted_by: 'Meenakshi Iyer',
  });

  const loadAll = () => {
    Promise.all([
      api.getApplications(),
      api.getAdopters(),
      api.getAnimals(),
      api.getFollowups(),
      api.getMatchmaking(matchAdopterId || undefined),
    ])
      .then(([apps, adpts, anims, fus, m]) => {
        setApplications(apps);
        setAdopters(adpts);
        setAnimals(anims);
        setFollowups(fus);
        setMatches(m);
      })
      .catch((err) => setFeedback({ type: 'danger', text: err.message }));
  };

  useEffect(() => {
    loadAll();
  }, [refreshTick, matchAdopterId]);

  const handleTransition = async (appId, status, extra = {}) => {
    setFeedback({ type: '', text: '' });
    try {
      const updated = await api.updateApplicationStatus(appId, { status, ...extra });
      setFeedback({
        type: 'success',
        text: `Application ${updated.application_code} updated to '${updated.status.replace('_', ' ')}'.`,
      });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleFinalize = async (e) => {
    e.preventDefault();
    try {
      const placement = await api.finalizeApplication(finalizeTarget.id, {
        ...finForm,
        adoption_fee: Number(finForm.adoption_fee),
      });
      setFinalizeTarget(null);
      setFeedback({
        type: 'success',
        text: `Adoption finalized! Certificate ${placement.certificate_number} issued and 3 follow-ups auto-scheduled.`,
      });
      setCertPlacementId(placement.id);
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleCreateApp = async (e) => {
    e.preventDefault();
    try {
      const created = await api.createApplication({
        adopter_id: Number(appForm.adopter_id),
        animal_id: Number(appForm.animal_id),
        reviewer_notes: appForm.reviewer_notes,
      });
      setShowNewApp(false);
      setFeedback({ type: 'success', text: `Submitted application ${created.application_code}.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleCreateAdopter = async (e) => {
    e.preventDefault();
    try {
      const created = await api.createAdopter(adopterForm);
      setShowNewAdopter(false);
      setFeedback({ type: 'success', text: `Registered adopter ${created.full_name}.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleCompleteFollowup = async (e) => {
    e.preventDefault();
    try {
      await api.completeFollowup(followupTarget.id, fuForm);
      setFollowupTarget(null);
      setFeedback({ type: 'success', text: `Follow-up check recorded for ${followupTarget.animal_name}.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Adoptions, Smart Match & Follow-Ups</h1>
          <p className="page-subtitle">
            Track adoption applications from submission to atomic placement, run smart matchmaking, and log post-adoption check-ins
          </p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button className="btn" onClick={() => setShowNewAdopter(true)}>
            <UserPlus size={15} /> New Adopter
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const firstAdopter = adopters.find((a) => a.status === 'active') || adopters[0];
              const firstAnimal = animals.find((a) => a.adoption_status !== 'adopted');
              setAppForm({
                adopter_id: firstAdopter?.id || '',
                animal_id: firstAnimal?.id || '',
                reviewer_notes: '',
              });
              setShowNewApp(true);
            }}
          >
            <Plus size={15} /> Submit Application
          </button>
        </div>
      </div>

      {feedback.text && <div className={`alert-banner alert-${feedback.type}`}>{feedback.text}</div>}

      <div className="tabs">
        <button className={`tab-btn ${subTab === 'applications' ? 'active' : ''}`} onClick={() => setSubTab('applications')}>
          <ClipboardList size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          Applications Pipeline ({applications.length})
        </button>
        <button className={`tab-btn ${subTab === 'matchmaking' ? 'active' : ''}`} onClick={() => setSubTab('matchmaking')}>
          <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          Smart Matchmaking
        </button>
        <button className={`tab-btn ${subTab === 'followups' ? 'active' : ''}`} onClick={() => setSubTab('followups')}>
          <CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />
          Post-Adoption Follow-Ups ({followups.length})
        </button>
        <button className={`tab-btn ${subTab === 'adopters' ? 'active' : ''}`} onClick={() => setSubTab('adopters')}>
          Adopters Directory ({adopters.length})
        </button>
      </div>

      {subTab === 'applications' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Adopter</th>
                <th>Animal</th>
                <th>Home Check</th>
                <th>Status</th>
                <th>Reviewer Notes</th>
                <th>Workflow Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id}>
                  <td><strong>{app.application_code}</strong></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{app.adopter_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#5a6c63' }}>
                      {app.housing_type} {app.has_yard ? '• Yard' : ''}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{app.animal_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#5a6c63' }}>{app.species_name} • {app.microchip_id}</div>
                  </td>
                  <td>
                    {app.home_check_passed ? (
                      <span className="badge badge-success">Passed</span>
                    ) : (
                      <span className="badge badge-neutral">Pending</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${APP_BADGE[app.status] || 'badge-neutral'}`}>
                      {app.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ maxWidth: 240, fontSize: '0.82rem', color: '#45574e' }}>{app.reviewer_notes}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {app.status === 'submitted' && (
                        <button className="btn btn-sm" onClick={() => handleTransition(app.id, 'under_review')}>
                          Start Review
                        </button>
                      )}
                      {app.status === 'under_review' && (
                        <button className="btn btn-sm" onClick={() => handleTransition(app.id, 'home_check')}>
                          Schedule Home Check
                        </button>
                      )}
                      {app.status === 'home_check' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            handleTransition(app.id, 'approved', {
                              home_check_passed: true,
                              reviewer_notes: 'Home check passed & approved',
                            })
                          }
                        >
                          Pass & Approve
                        </button>
                      )}
                      {app.status === 'approved' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => setFinalizeTarget(app)}
                        >
                          <Award size={13} /> Finalize & Certificate
                        </button>
                      )}
                      {app.status === 'completed' && app.placement_id && (
                        <button className="btn btn-sm" onClick={() => setCertPlacementId(app.placement_id)}>
                          <Award size={13} /> {app.certificate_number}
                        </button>
                      )}
                      {['submitted', 'under_review', 'home_check', 'approved'].includes(app.status) && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleTransition(app.id, 'rejected', { reviewer_notes: 'Rejected by panel' })}
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'matchmaking' && (
        <div className="card">
          <div className="toolbar">
            <label style={{ fontWeight: 600, fontSize: '0.88rem' }}>Evaluate Compatibility For Adopter:</label>
            <select
              className="select"
              value={matchAdopterId}
              onChange={(e) => setMatchAdopterId(e.target.value)}
            >
              <option value="">General Shelter Placement Priority (Stay + Crowding)</option>
              {adopters.map((ad) => (
                <option key={ad.id} value={ad.id}>
                  {ad.full_name} ({ad.housing_type}, {ad.has_yard ? 'Yard' : 'No Yard'}, {ad.has_other_pets ? 'Has Pets' : 'No Pets'})
                </option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Priority Score</th>
                  <th>Animal</th>
                  <th>Stay Days</th>
                  <th>Zone</th>
                  <th>Readiness</th>
                  <th>Match Highlights / Blockers</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.animal_id}>
                    <td>
                      <strong style={{ fontSize: '1.05rem', color: m.priority_score >= 75 ? '#059669' : '#0f5c4d' }}>
                        {m.priority_score} / 100
                      </strong>
                      <div style={{ fontSize: '0.73rem', color: '#5a6c63' }}>
                        Urg:{m.score_breakdown.urgency_stay} • Med:{m.score_breakdown.medical_readiness} • Fit:{m.score_breakdown.lifestyle_compatibility}
                      </div>
                    </td>
                    <td>
                      <strong>{m.name}</strong> ({m.microchip_id})
                      <div style={{ fontSize: '0.76rem', color: '#5a6c63' }}>
                        {m.species_name} • {m.breed_name} ({m.size_category})
                      </div>
                    </td>
                    <td>{m.stay_days} days</td>
                    <td><span className="badge badge-neutral">{m.zone_code}</span></td>
                    <td>
                      {m.ready_for_adoption ? (
                        <span className="badge badge-success">Ready</span>
                      ) : (
                        <span className="badge badge-warning">Blocked</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {m.match_reasons.map((r, i) => (
                        <div key={i} style={{ color: '#065f46' }}>• {r}</div>
                      ))}
                      {m.warnings.map((w, i) => (
                        <div key={i} style={{ color: '#92400e' }}>! {w}</div>
                      ))}
                      {m.blockers.map((b, i) => (
                        <div key={i} style={{ color: '#991b1b' }}>× {b}</div>
                      ))}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setAppForm({
                            adopter_id: matchAdopterId || adopters[0]?.id || '',
                            animal_id: m.animal_id,
                            reviewer_notes: `Matched via Smart Matchmaking (score ${m.priority_score}/100)`,
                          });
                          setShowNewApp(true);
                        }}
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'followups' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scheduled</th>
                <th>Type</th>
                <th>Animal</th>
                <th>Adopter</th>
                <th>Certificate</th>
                <th>Wellbeing</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {followups.map((f) => (
                <tr key={f.id}>
                  <td>{f.scheduled_date}</td>
                  <td><span className="badge badge-info">{f.followup_type.replaceAll('_', ' ')}</span></td>
                  <td><strong>{f.animal_name}</strong></td>
                  <td>
                    <div>{f.adopter_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#5a6c63' }}>{f.adopter_phone}</div>
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => setCertPlacementId(f.placement_id)}>
                      {f.certificate_number}
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${WELLBEING_BADGE[f.animal_wellbeing] || 'badge-neutral'}`}>
                      {f.animal_wellbeing.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ maxWidth: 240, fontSize: '0.82rem' }}>{f.notes || '—'}</td>
                  <td>
                    {f.animal_wellbeing === 'pending' ? (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setFollowupTarget(f);
                          setFuForm({
                            completed_date: new Date().toISOString().slice(0, 10),
                            animal_wellbeing: 'thriving',
                            notes: '',
                            conducted_by: 'Meenakshi Iyer',
                          });
                        }}
                      >
                        Record Check-In
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: '#5a6c63' }}>
                        Done {f.completed_date} ({f.conducted_by})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'adopters' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Housing</th>
                <th>Household</th>
                <th>Applications</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {adopters.map((ad) => (
                <tr key={ad.id}>
                  <td><strong>{ad.full_name}</strong></td>
                  <td style={{ fontSize: '0.82rem' }}>
                    <div>{ad.email}</div>
                    <div style={{ color: '#5a6c63' }}>{ad.phone}</div>
                  </td>
                  <td>{ad.housing_type} {ad.has_yard ? '• Yard' : ''}</td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {ad.has_other_pets ? 'Other Pets' : 'No Other Pets'} • {ad.has_children ? 'Kids' : 'No Kids'}
                  </td>
                  <td>{ad.total_applications} ({ad.completed_adoptions} adopted)</td>
                  <td>
                    <span className={`badge ${ad.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {ad.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        const next = ad.status === 'active' ? 'restricted' : 'active';
                        await api.updateAdopterStatus(ad.id, next);
                        onChanged();
                      }}
                    >
                      Toggle {ad.status === 'active' ? 'Restrict' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Submit Application Modal */}
      {showNewApp && (
        <Modal title="Submit Adoption Application (Enforces 30-Day Rejection Cooldown)" onClose={() => setShowNewApp(false)}>
          <form onSubmit={handleCreateApp}>
            <div className="form-grid">
              <div className="form-field">
                <label>Adopter *</label>
                <select
                  className="select"
                  required
                  value={appForm.adopter_id}
                  onChange={(e) => setAppForm({ ...appForm, adopter_id: e.target.value })}
                >
                  {adopters.map((ad) => (
                    <option key={ad.id} value={ad.id}>
                      {ad.full_name} ({ad.status})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Animal *</label>
                <select
                  className="select"
                  required
                  value={appForm.animal_id}
                  onChange={(e) => setAppForm({ ...appForm, animal_id: e.target.value })}
                >
                  {animals
                    .filter((a) => a.adoption_status !== 'adopted')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.microchip_id} • {a.adoption_status})
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="form-field" style={{ marginTop: 12 }}>
              <label>Reviewer / Intake Notes</label>
              <textarea
                rows={2}
                className="textarea"
                value={appForm.reviewer_notes}
                onChange={(e) => setAppForm({ ...appForm, reviewer_notes: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setShowNewApp(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Submit Application</button>
            </div>
          </form>
        </Modal>
      )}

      {/* New Adopter Modal */}
      {showNewAdopter && (
        <Modal title="Register Prospective Adopter" onClose={() => setShowNewAdopter(false)}>
          <form onSubmit={handleCreateAdopter}>
            <div className="form-grid">
              <div className="form-field">
                <label>Full Name *</label>
                <input className="input" required value={adopterForm.full_name} onChange={(e) => setAdopterForm({ ...adopterForm, full_name: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Email *</label>
                <input type="email" className="input" required value={adopterForm.email} onChange={(e) => setAdopterForm({ ...adopterForm, email: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Phone *</label>
                <input className="input" required value={adopterForm.phone} onChange={(e) => setAdopterForm({ ...adopterForm, phone: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Housing Type *</label>
                <select className="select" value={adopterForm.housing_type} onChange={(e) => setAdopterForm({ ...adopterForm, housing_type: e.target.value })}>
                  <option value="house">House</option>
                  <option value="apartment">Apartment</option>
                  <option value="condo">Condo</option>
                  <option value="farm">Farm</option>
                </select>
              </div>
            </div>
            <div className="form-field" style={{ marginTop: 12 }}>
              <label>Address *</label>
              <input className="input" required value={adopterForm.address} onChange={(e) => setAdopterForm({ ...adopterForm, address: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
              <label className="checkbox-row">
                <input type="checkbox" checked={adopterForm.has_yard} onChange={(e) => setAdopterForm({ ...adopterForm, has_yard: e.target.checked })} />
                Has Fenced Yard
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={adopterForm.has_other_pets} onChange={(e) => setAdopterForm({ ...adopterForm, has_other_pets: e.target.checked })} />
                Has Other Pets
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={adopterForm.has_children} onChange={(e) => setAdopterForm({ ...adopterForm, has_children: e.target.checked })} />
                Has Children
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setShowNewAdopter(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Adopter</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Finalize Placement Modal */}
      {finalizeTarget && (
        <Modal
          title={`Finalize Adoption — ${finalizeTarget.animal_name} to ${finalizeTarget.adopter_name}`}
          onClose={() => setFinalizeTarget(null)}
        >
          <p style={{ fontSize: '0.88rem', color: '#45574e', marginTop: 0 }}>
            Runs inside an atomic SQLite <code>BEGIN IMMEDIATE</code> transaction: locks animal against double-adoption,
            issues a unique adoption certificate, closes competing applications, and auto-schedules 7/30/90-day follow-ups.
          </p>
          <form onSubmit={handleFinalize}>
            <div className="form-grid">
              <div className="form-field">
                <label>Adoption Date *</label>
                <input type="date" className="input" required value={finForm.adoption_date} onChange={(e) => setFinForm({ ...finForm, adoption_date: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Adoption Fee (₹) *</label>
                <input type="number" min="0" step="50" className="input" required value={finForm.adoption_fee} onChange={(e) => setFinForm({ ...finForm, adoption_fee: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Issued By *</label>
                <input className="input" required value={finForm.issued_by} onChange={(e) => setFinForm({ ...finForm, issued_by: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setFinalizeTarget(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Confirm Placement & Issue Certificate</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Complete Follow-Up Modal */}
      {followupTarget && (
        <Modal title={`Record ${followupTarget.followup_type.replaceAll('_', ' ')} — ${followupTarget.animal_name}`} onClose={() => setFollowupTarget(null)}>
          <form onSubmit={handleCompleteFollowup}>
            <div className="form-grid">
              <div className="form-field">
                <label>Completed Date *</label>
                <input type="date" className="input" required value={fuForm.completed_date} onChange={(e) => setFuForm({ ...fuForm, completed_date: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Animal Wellbeing *</label>
                <select className="select" value={fuForm.animal_wellbeing} onChange={(e) => setFuForm({ ...fuForm, animal_wellbeing: e.target.value })}>
                  <option value="thriving">Thriving</option>
                  <option value="adjusting">Adjusting</option>
                  <option value="needs_support">Needs Support</option>
                  <option value="returned">Returned to Shelter</option>
                </select>
              </div>
              <div className="form-field">
                <label>Conducted By *</label>
                <input className="input" required value={fuForm.conducted_by} onChange={(e) => setFuForm({ ...fuForm, conducted_by: e.target.value })} />
              </div>
            </div>
            <div className="form-field" style={{ marginTop: 12 }}>
              <label>Welfare Notes *</label>
              <textarea rows={3} className="textarea" required value={fuForm.notes} onChange={(e) => setFuForm({ ...fuForm, notes: e.target.value })} placeholder="Appetite, behavior, vet follow-up details..." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setFollowupTarget(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Check-In</button>
            </div>
          </form>
        </Modal>
      )}

      {certPlacementId && (
        <CertificateModal placementId={certPlacementId} onClose={() => setCertPlacementId(null)} />
      )}
    </div>
  );
}
