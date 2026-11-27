import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, ShieldCheck, Syringe } from 'lucide-react';
import { api } from '../api';
import { Modal } from '../components/Modal';

export function MedicalAndVaccines({ metadata, refreshTick, onChanged }) {
  const [tab, setTab] = useState('vaccinations');
  const [vaccinations, setVaccinations] = useState([]);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [showVaxModal, setShowVaxModal] = useState(false);
  const [showMedModal, setShowMedModal] = useState(false);

  const [vaxForm, setVaxForm] = useState({
    animal_id: '',
    vaccine_type_id: '',
    administered_date: new Date().toISOString().slice(0, 10),
    batch_number: '',
    administered_by: 'Dr. Ananya Rao',
  });

  const [medForm, setMedForm] = useState({
    animal_id: '',
    visit_date: new Date().toISOString().slice(0, 10),
    record_type: 'checkup',
    diagnosis: '',
    treatment_notes: '',
    vet_name: 'Dr. Ananya Rao',
    cleared_for_adoption: false,
    update_medical_status: '',
  });

  const loadData = () => {
    Promise.all([api.getVaccinations(), api.getMedicalRecords(), api.getAnimals()])
      .then(([v, m, a]) => {
        setVaccinations(v);
        setMedicalRecords(m);
        setAnimals(a);
      })
      .catch((err) => setFeedback({ type: 'danger', text: err.message }));
  };

  useEffect(() => {
    loadData();
  }, [refreshTick]);

  const handleSyncExpiry = async () => {
    try {
      const res = await api.syncVaccineExpiry();
      setFeedback({
        type: 'success',
        text: `Synced vaccination expiry as of ${res.reference_date}: ${res.valid} valid, ${res.due_soon} due soon, ${res.overdue} overdue.`,
      });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleVaxSubmit = async (e) => {
    e.preventDefault();
    try {
      const created = await api.createVaccination({
        ...vaxForm,
        animal_id: Number(vaxForm.animal_id),
        vaccine_type_id: Number(vaxForm.vaccine_type_id),
      });
      setShowVaxModal(false);
      setFeedback({
        type: 'success',
        text: `Logged ${created.vaccine_name} for ${created.animal_name}. Next booster auto-calculated: ${created.next_due_date}.`,
      });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleMedSubmit = async (e) => {
    e.preventDefault();
    try {
      const created = await api.createMedicalRecord({
        ...medForm,
        animal_id: Number(medForm.animal_id),
        update_medical_status: medForm.update_medical_status || null,
      });
      setShowMedModal(false);
      setFeedback({
        type: 'success',
        text: `Medical visit recorded for ${created.animal_name} (${created.record_type}).`,
      });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const selectedVaxAnimal = animals.find((a) => String(a.id) === String(vaxForm.animal_id));
  const compatibleVaccines = selectedVaxAnimal
    ? metadata.vaccine_types.filter((vt) => vt.species_id === selectedVaxAnimal.species_id)
    : metadata.vaccine_types;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Medical & Vaccination Histories</h1>
          <p className="page-subtitle">
            Automated booster expiry calculation, quarantine medical clearance gates, and clinical treatment logs
          </p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button className="btn" onClick={handleSyncExpiry}>
            <RefreshCw size={15} /> Sync Booster Expiry
          </button>
          <button
            className="btn"
            onClick={() => {
              const first = animals[0];
              setMedForm((f) => ({ ...f, animal_id: f.animal_id || first?.id || '' }));
              setShowMedModal(true);
            }}
          >
            <Plus size={15} /> Log Vet Exam
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const first = animals[0];
              const firstVax = metadata.vaccine_types.find((v) => v.species_id === first?.species_id);
              setVaxForm((f) => ({
                ...f,
                animal_id: f.animal_id || first?.id || '',
                vaccine_type_id: f.vaccine_type_id || firstVax?.id || '',
              }));
              setShowVaxModal(true);
            }}
          >
            <Syringe size={15} /> Administer Vaccine
          </button>
        </div>
      </div>

      {feedback.text && <div className={`alert-banner alert-${feedback.type}`}>{feedback.text}</div>}

      <div className="tabs">
        <button className={`tab-btn ${tab === 'vaccinations' ? 'active' : ''}`} onClick={() => setTab('vaccinations')}>
          Vaccination Ledger ({vaccinations.length})
        </button>
        <button className={`tab-btn ${tab === 'medical' ? 'active' : ''}`} onClick={() => setTab('medical')}>
          Clinical & Medical History ({medicalRecords.length})
        </button>
      </div>

      {tab === 'vaccinations' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Animal</th>
                <th>Species</th>
                <th>Vaccine</th>
                <th>Mandatory</th>
                <th>Administered</th>
                <th>Next Booster Due</th>
                <th>Batch</th>
                <th>Vet</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vaccinations.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.animal_name}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#5a6c63' }}>{v.microchip_id}</div>
                  </td>
                  <td>{v.species_name}</td>
                  <td><strong>{v.vaccine_name}</strong></td>
                  <td>{v.is_mandatory ? 'Yes' : 'Optional'}</td>
                  <td>{v.administered_date}</td>
                  <td><strong>{v.next_due_date}</strong></td>
                  <td>{v.batch_number}</td>
                  <td>{v.administered_by}</td>
                  <td>
                    <span
                      className={`badge ${
                        v.status === 'valid'
                          ? 'badge-success'
                          : v.status === 'due_soon'
                          ? 'badge-warning'
                          : 'badge-danger'
                      }`}
                    >
                      {v.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'medical' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Visit Date</th>
                <th>Animal</th>
                <th>Type</th>
                <th>Diagnosis</th>
                <th>Treatment Notes</th>
                <th>Veterinarian</th>
                <th>Adoption Clearance</th>
              </tr>
            </thead>
            <tbody>
              {medicalRecords.map((m) => (
                <tr key={m.id}>
                  <td>{m.visit_date}</td>
                  <td>
                    <strong>{m.animal_name}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#5a6c63' }}>{m.microchip_id}</div>
                  </td>
                  <td><span className="badge badge-info">{m.record_type.replace('_', ' ')}</span></td>
                  <td>{m.diagnosis}</td>
                  <td>{m.treatment_notes}</td>
                  <td>{m.vet_name}</td>
                  <td>
                    {m.cleared_for_adoption ? (
                      <span className="badge badge-success"><ShieldCheck size={12} /> Cleared</span>
                    ) : (
                      <span className="badge badge-neutral">Not Cleared</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showVaxModal && (
        <Modal title="Administer Vaccine (Auto-Computes Booster Expiry)" onClose={() => setShowVaxModal(false)}>
          <form onSubmit={handleVaxSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Animal *</label>
                <select
                  className="select"
                  required
                  value={vaxForm.animal_id}
                  onChange={(e) => {
                    const aid = Number(e.target.value);
                    const anim = animals.find((a) => a.id === aid);
                    const firstVt = metadata.vaccine_types.find((vt) => vt.species_id === anim?.species_id);
                    setVaxForm({ ...vaxForm, animal_id: aid, vaccine_type_id: firstVt?.id || '' });
                  }}
                >
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.microchip_id} • {a.species_name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Protocol Vaccine *</label>
                <select
                  className="select"
                  required
                  value={vaxForm.vaccine_type_id}
                  onChange={(e) => setVaxForm({ ...vaxForm, vaccine_type_id: e.target.value })}
                >
                  {compatibleVaccines.map((vt) => (
                    <option key={vt.id} value={vt.id}>
                      {vt.vaccine_name} (+{vt.booster_interval_days}d){vt.is_mandatory ? ' [Mandatory]' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Administered Date *</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={vaxForm.administered_date}
                  onChange={(e) => setVaxForm({ ...vaxForm, administered_date: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Batch Number *</label>
                <input
                  className="input"
                  required
                  value={vaxForm.batch_number}
                  onChange={(e) => setVaxForm({ ...vaxForm, batch_number: e.target.value })}
                  placeholder="e.g. RB-2611-X1"
                />
              </div>
              <div className="form-field">
                <label>Administered By *</label>
                <input
                  className="input"
                  required
                  value={vaxForm.administered_by}
                  onChange={(e) => setVaxForm({ ...vaxForm, administered_by: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setShowVaxModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Record Vaccination</button>
            </div>
          </form>
        </Modal>
      )}

      {showMedModal && (
        <Modal title="Record Veterinary Exam / Medical Clearance" onClose={() => setShowMedModal(false)}>
          <form onSubmit={handleMedSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Animal *</label>
                <select
                  className="select"
                  required
                  value={medForm.animal_id}
                  onChange={(e) => setMedForm({ ...medForm, animal_id: e.target.value })}
                >
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.microchip_id} • {a.medical_status})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Visit Date *</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={medForm.visit_date}
                  onChange={(e) => setMedForm({ ...medForm, visit_date: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Record Type *</label>
                <select
                  className="select"
                  value={medForm.record_type}
                  onChange={(e) => setMedForm({ ...medForm, record_type: e.target.value })}
                >
                  <option value="checkup">Routine Checkup</option>
                  <option value="intake_exam">Intake Exam</option>
                  <option value="treatment">Treatment</option>
                  <option value="surgery">Surgery / Spay-Neuter</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div className="form-field">
                <label>Update Medical Status</label>
                <select
                  className="select"
                  value={medForm.update_medical_status}
                  onChange={(e) => setMedForm({ ...medForm, update_medical_status: e.target.value })}
                >
                  <option value="">(Keep current)</option>
                  <option value="cleared">Cleared</option>
                  <option value="treatment">Treatment</option>
                  <option value="quarantine">Quarantine</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="form-field">
                <label>Diagnosis *</label>
                <input
                  className="input"
                  required
                  value={medForm.diagnosis}
                  onChange={(e) => setMedForm({ ...medForm, diagnosis: e.target.value })}
                  placeholder="e.g. Healthy post-quarantine"
                />
              </div>
              <div className="form-field">
                <label>Veterinarian *</label>
                <input
                  className="input"
                  required
                  value={medForm.vet_name}
                  onChange={(e) => setMedForm({ ...medForm, vet_name: e.target.value })}
                />
              </div>
            </div>
            <div className="form-field" style={{ marginTop: 12 }}>
              <label>Treatment Notes *</label>
              <textarea
                rows={2}
                className="textarea"
                required
                value={medForm.treatment_notes}
                onChange={(e) => setMedForm({ ...medForm, treatment_notes: e.target.value })}
              />
            </div>
            <label className="checkbox-row" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={medForm.cleared_for_adoption}
                onChange={(e) => setMedForm({ ...medForm, cleared_for_adoption: e.target.checked })}
              />
              Grant Adoption Medical Clearance (enforces quarantine completion)
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setShowMedModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Medical Record</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
