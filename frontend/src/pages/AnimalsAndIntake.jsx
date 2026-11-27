import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Edit3, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Modal } from '../components/Modal';

const ADOPT_BADGE = {
  available: 'badge-success',
  pending_adoption: 'badge-info',
  adopted: 'badge-neutral',
  medical_hold: 'badge-warning',
  deceased: 'badge-danger',
};

const MED_BADGE = {
  cleared: 'badge-success',
  quarantine: 'badge-warning',
  treatment: 'badge-info',
  critical: 'badge-danger',
};

export function AnimalsAndIntake({ userRole, metadata, zones, refreshTick, onChanged }) {
  const [animals, setAnimals] = useState([]);
  const [filters, setFilters] = useState({ species: '', adoption_status: '', zone_id: '', search: '' });
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [relocateTarget, setRelocateTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [newZoneId, setNewZoneId] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const [form, setForm] = useState({
    source_type: 'rescue',
    source_name: '',
    intake_date: new Date().toISOString().slice(0, 10),
    intake_condition: 'healthy',
    intake_notes: '',
    name: '',
    breed_id: '',
    zone_id: '',
    gender: 'male',
    age_months: 12,
    weight_kg: 10.0,
    spayed_neutered: false,
    good_with_kids: true,
    good_with_pets: true,
    animal_notes: '',
  });

  const loadAnimals = () => {
    api
      .getAnimals(filters)
      .then(setAnimals)
      .catch((err) => setFeedback({ type: 'danger', text: err.message }));
  };

  useEffect(() => {
    loadAnimals();
  }, [filters, refreshTick]);

  const openDetail = (id) => {
    api
      .getAnimalDetail(id)
      .then(setSelectedAnimal)
      .catch((err) => setFeedback({ type: 'danger', text: err.message }));
  };

  const handleIntakeSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', text: '' });
    try {
      const created = await api.createIntakeAndAnimal({
        ...form,
        breed_id: Number(form.breed_id),
        zone_id: Number(form.zone_id),
        age_months: Number(form.age_months),
        weight_kg: Number(form.weight_kg),
      });
      setShowIntakeModal(false);
      setFeedback({
        type: 'success',
        text: `Admitted ${created.name} (${created.microchip_id}) via ${created.intake_code}. Quarantine until ${created.quarantine_until}.`,
      });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleRelocate = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.relocateAnimalZone(relocateTarget.id, Number(newZoneId));
      setRelocateTarget(null);
      setFeedback({ type: 'success', text: `Moved ${updated.name} to zone ${updated.zone_code}.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.updateAnimal(editTarget.id, {
        name: editTarget.name,
        age_months: Number(editTarget.age_months),
        weight_kg: Number(editTarget.weight_kg),
        spayed_neutered: Boolean(editTarget.spayed_neutered),
        good_with_kids: Boolean(editTarget.good_with_kids),
        good_with_pets: Boolean(editTarget.good_with_pets),
        notes: editTarget.notes,
      });
      setEditTarget(null);
      setFeedback({ type: 'success', text: `Updated record for ${updated.name}.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleDelete = async (animal) => {
    if (!window.confirm(`Remove animal record for ${animal.name} (${animal.microchip_id})?`)) return;
    try {
      await api.deleteAnimal(animal.id);
      setFeedback({ type: 'success', text: `Removed animal ${animal.name}.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Animals & Shelter Capacity</h1>
          <p className="page-subtitle">
            Manage animal intake records, quarantine dates, kennel capacity enforcement, and adoption readiness
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            const firstBreed = metadata.breeds[0];
            const matchingZone = zones.find((z) => z.species_id === firstBreed?.species_id && z.available_slots > 0);
            setForm((prev) => ({
              ...prev,
              breed_id: prev.breed_id || firstBreed?.id || '',
              zone_id: prev.zone_id || matchingZone?.id || zones[0]?.id || '',
            }));
            setShowIntakeModal(true);
          }}
        >
          <Plus size={16} /> Register Intake & Animal
        </button>
      </div>

      {feedback.text && (
        <div className={`alert-banner alert-${feedback.type}`}>{feedback.text}</div>
      )}

      {/* Shelter Zones Strip */}
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        {zones.map((z) => {
          const isSelected = String(filters.zone_id) === String(z.id);
          return (
            <div
              key={z.id}
              className="card"
              style={{
                padding: 14,
                cursor: 'pointer',
                borderColor: isSelected ? '#0f5c4d' : undefined,
                background: isSelected ? '#f1f8f6' : undefined,
              }}
              onClick={() =>
                setFilters((f) => ({ ...f, zone_id: isSelected ? '' : String(z.id) }))
              }
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.88rem' }}>
                <span>{z.zone_code} ({z.species_name})</span>
                <span>{z.occupied_slots}/{z.max_capacity}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#5a6c63', marginTop: 2 }}>
                {z.zone_name} • {z.available_slots} free slot(s)
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${z.occupancy_pct}%`,
                    background: z.occupancy_pct >= 85 ? '#dc2626' : '#0f5c4d',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters & Animal Table */}
      <div className="card">
        <div className="toolbar">
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#5a6c63' }} />
            <input
              className="input"
              style={{ width: '100%', paddingLeft: 32 }}
              placeholder="Search name, microchip ID, or breed..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>

          <select
            className="select"
            value={filters.species}
            onChange={(e) => setFilters({ ...filters, species: e.target.value })}
          >
            <option value="">All Species</option>
            {metadata.species.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>

          <select
            className="select"
            value={filters.adoption_status}
            onChange={(e) => setFilters({ ...filters, adoption_status: e.target.value })}
          >
            <option value="">All Adoption Statuses</option>
            <option value="available">Available</option>
            <option value="pending_adoption">Pending Adoption</option>
            <option value="medical_hold">Medical Hold</option>
            <option value="adopted">Adopted</option>
          </select>

          {(filters.species || filters.adoption_status || filters.zone_id || filters.search) && (
            <button
              className="btn btn-sm"
              onClick={() => setFilters({ species: '', adoption_status: '', zone_id: '', search: '' })}
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Microchip ID</th>
                <th>Animal</th>
                <th>Species / Breed</th>
                <th>Zone</th>
                <th>Quarantine Until</th>
                <th>Medical</th>
                <th>Adoption Status</th>
                <th>Readiness</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {animals.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.microchip_id}</strong></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: '0.76rem', color: '#5a6c63' }}>
                      {a.gender}, {a.age_months}m, {a.weight_kg} kg
                    </div>
                  </td>
                  <td>{a.species_name} • {a.breed_name}</td>
                  <td><span className="badge badge-neutral">{a.zone_code}</span></td>
                  <td>{a.quarantine_until}</td>
                  <td>
                    <span className={`badge ${MED_BADGE[a.medical_status] || 'badge-neutral'}`}>
                      {a.medical_status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${ADOPT_BADGE[a.adoption_status] || 'badge-neutral'}`}>
                      {a.adoption_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {a.adoption_ready ? (
                      <span className="badge badge-success">Cleared</span>
                    ) : (
                      <span
                        className="badge badge-warning"
                        title={(a.readiness_blockers || []).join('\n')}
                      >
                        {a.readiness_blockers?.length || 1} Blocker(s)
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => openDetail(a.id)}>
                        <Eye size={13} /> Profile
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditTarget({ ...a })}>
                        <Edit3 size={13} /> Edit
                      </button>
                      {a.adoption_status !== 'adopted' && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setRelocateTarget(a);
                            setNewZoneId(String(a.zone_id));
                          }}
                        >
                          <ArrowRightLeft size={13} /> Move
                        </button>
                      )}
                      {userRole === 'ADMIN' && a.adoption_status !== 'adopted' && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {animals.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: '#5a6c63', padding: 24 }}>
                    No animals match your current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Intake & Animal Modal */}
      {showIntakeModal && (
        <Modal title="Register Animal Intake (Auto-Quarantine & Capacity Check)" onClose={() => setShowIntakeModal(false)} wide>
          <form onSubmit={handleIntakeSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Animal Name *</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Charlie"
                />
              </div>
              <div className="form-field">
                <label>Breed (determines species in 3NF) *</label>
                <select
                  className="select"
                  required
                  value={form.breed_id}
                  onChange={(e) => {
                    const breedId = Number(e.target.value);
                    const breed = metadata.breeds.find((b) => b.id === breedId);
                    const matchZone = zones.find((z) => z.species_id === breed?.species_id);
                    setForm({ ...form, breed_id: breedId, zone_id: matchZone ? matchZone.id : form.zone_id });
                  }}
                >
                  {metadata.breeds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.species_name} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Shelter Zone *</label>
                <select
                  className="select"
                  required
                  value={form.zone_id}
                  onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.zone_code} ({z.species_name}) — {z.occupied_slots}/{z.max_capacity} occupied
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Intake Date *</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={form.intake_date}
                  onChange={(e) => setForm({ ...form, intake_date: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Intake Source Type *</label>
                <select
                  className="select"
                  value={form.source_type}
                  onChange={(e) => setForm({ ...form, source_type: e.target.value })}
                >
                  <option value="rescue">Rescue</option>
                  <option value="stray">Stray</option>
                  <option value="owner_surrender">Owner Surrender</option>
                  <option value="transfer">Shelter Transfer</option>
                </select>
              </div>
              <div className="form-field">
                <label>Source / Rescuer Name *</label>
                <input
                  className="input"
                  required
                  value={form.source_name}
                  onChange={(e) => setForm({ ...form, source_name: e.target.value })}
                  placeholder="e.g. Municipal Rescue Team"
                />
              </div>
              <div className="form-field">
                <label>Intake Condition *</label>
                <select
                  className="select"
                  value={form.intake_condition}
                  onChange={(e) => setForm({ ...form, intake_condition: e.target.value })}
                >
                  <option value="healthy">Healthy</option>
                  <option value="minor_injury">Minor Injury</option>
                  <option value="malnourished">Malnourished</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="form-field">
                <label>Gender *</label>
                <select
                  className="select"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div className="form-field">
                <label>Age (months) *</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  required
                  value={form.age_months}
                  onChange={(e) => setForm({ ...form, age_months: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Weight (kg) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className="input"
                  required
                  value={form.weight_kg}
                  onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 12 }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.spayed_neutered}
                  onChange={(e) => setForm({ ...form, spayed_neutered: e.target.checked })}
                />
                Spayed / Neutered
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.good_with_kids}
                  onChange={(e) => setForm({ ...form, good_with_kids: e.target.checked })}
                />
                Good with kids
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.good_with_pets}
                  onChange={(e) => setForm({ ...form, good_with_pets: e.target.checked })}
                />
                Good with other pets
              </label>
            </div>

            <div className="form-field" style={{ marginTop: 12 }}>
              <label>Intake Notes</label>
              <textarea
                rows={2}
                className="textarea"
                value={form.intake_notes}
                onChange={(e) => setForm({ ...form, intake_notes: e.target.value })}
                placeholder="Observations on arrival..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setShowIntakeModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Admit Animal</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Animal Modal */}
      {editTarget && (
        <Modal title={`Edit Animal — ${editTarget.name} (${editTarget.microchip_id})`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleEditSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Name *</label>
                <input className="input" required value={editTarget.name} onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Age (months) *</label>
                <input type="number" min="0" className="input" required value={editTarget.age_months} onChange={(e) => setEditTarget({ ...editTarget, age_months: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Weight (kg) *</label>
                <input type="number" step="0.1" min="0.1" className="input" required value={editTarget.weight_kg} onChange={(e) => setEditTarget({ ...editTarget, weight_kg: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
              <label className="checkbox-row">
                <input type="checkbox" checked={Boolean(editTarget.spayed_neutered)} onChange={(e) => setEditTarget({ ...editTarget, spayed_neutered: e.target.checked })} />
                Spayed / Neutered
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={Boolean(editTarget.good_with_kids)} onChange={(e) => setEditTarget({ ...editTarget, good_with_kids: e.target.checked })} />
                Good with kids
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={Boolean(editTarget.good_with_pets)} onChange={(e) => setEditTarget({ ...editTarget, good_with_pets: e.target.checked })} />
                Good with pets
              </label>
            </div>
            <div className="form-field" style={{ marginTop: 12 }}>
              <label>Notes</label>
              <textarea rows={2} className="textarea" value={editTarget.notes || ''} onChange={(e) => setEditTarget({ ...editTarget, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setEditTarget(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Relocate Zone Modal */}
      {relocateTarget && (
        <Modal title={`Relocate ${relocateTarget.name} (${relocateTarget.microchip_id})`} onClose={() => setRelocateTarget(null)}>
          <form onSubmit={handleRelocate}>
            <div className="form-field">
              <label>Target Shelter Zone (must match species: {relocateTarget.species_name})</label>
              <select
                className="select"
                value={newZoneId}
                onChange={(e) => setNewZoneId(e.target.value)}
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.zone_code} — {z.zone_name} ({z.species_name}, {z.occupied_slots}/{z.max_capacity})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setRelocateTarget(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Move Animal</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Animal Detail Modal */}
      {selectedAnimal && (
        <Modal title={`${selectedAnimal.name} — Clinical & Shelter Profile`} onClose={() => setSelectedAnimal(null)} wide>
          <div className="cert-grid">
            <div className="cert-box">
              <div><strong>Microchip:</strong> {selectedAnimal.microchip_id}</div>
              <div><strong>Species / Breed:</strong> {selectedAnimal.species_name} / {selectedAnimal.breed_name}</div>
              <div><strong>Zone:</strong> {selectedAnimal.zone_code} ({selectedAnimal.zone_name})</div>
              <div><strong>Intake:</strong> {selectedAnimal.intake_date} ({selectedAnimal.intake_code || 'N/A'})</div>
              <div><strong>Quarantine Until:</strong> {selectedAnimal.quarantine_until}</div>
            </div>
            <div className="cert-box">
              <div><strong>Medical Status:</strong> {selectedAnimal.medical_status}</div>
              <div><strong>Adoption Status:</strong> {selectedAnimal.adoption_status}</div>
              <div><strong>Adoption Ready:</strong> {selectedAnimal.readiness.ready ? 'Yes' : 'No'}</div>
              {selectedAnimal.readiness.blockers.length > 0 && (
                <ul style={{ margin: '6px 0 0 18px', padding: 0, color: '#991b1b' }}>
                  {selectedAnimal.readiness.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
            </div>
          </div>

          <h4 style={{ margin: '12px 0 6px' }}>Vaccination History</h4>
          <table>
            <thead>
              <tr><th>Vaccine</th><th>Administered</th><th>Next Due</th><th>Status</th><th>Vet</th></tr>
            </thead>
            <tbody>
              {selectedAnimal.vaccinations.map((v) => (
                <tr key={v.id}>
                  <td>{v.vaccine_name}</td>
                  <td>{v.administered_date}</td>
                  <td>{v.next_due_date}</td>
                  <td><span className={`badge ${v.status === 'valid' ? 'badge-success' : v.status === 'due_soon' ? 'badge-warning' : 'badge-danger'}`}>{v.status}</span></td>
                  <td>{v.administered_by}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 style={{ margin: '16px 0 6px' }}>Medical Records</h4>
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Diagnosis</th><th>Treatment</th><th>Vet</th></tr>
            </thead>
            <tbody>
              {selectedAnimal.medical_records.map((m) => (
                <tr key={m.id}>
                  <td>{m.visit_date}</td>
                  <td>{m.record_type}</td>
                  <td>{m.diagnosis}</td>
                  <td>{m.treatment_notes}</td>
                  <td>{m.vet_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
