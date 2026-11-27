import React, { useEffect, useState } from 'react';
import { Award, Printer } from 'lucide-react';
import { api } from '../api';
import { Modal } from './Modal';

export function CertificateModal({ placementId, onClose }) {
  const [cert, setCert] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getCertificate(placementId)
      .then(setCert)
      .catch((err) => setError(err.message));
  }, [placementId]);

  return (
    <Modal title="Official Adoption Certificate" onClose={onClose} wide>
      {error && <div className="alert-banner alert-danger">{error}</div>}
      {!cert && !error && <p>Loading certificate...</p>}
      {cert && (
        <div>
          <div className="toolbar no-print" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={16} /> Print / Save PDF
            </button>
          </div>

          <div className="certificate-sheet">
            <div className="cert-header">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#0f5c4d', fontWeight: 700 }}>
                <Award size={24} /> {cert.shelter_organization}
              </div>
              <h2 style={{ margin: '8px 0 4px', fontSize: '1.55rem', letterSpacing: '0.03em' }}>
                CERTIFICATE OF ADOPTION
              </h2>
              <div style={{ fontSize: '0.88rem', color: '#5a6c63' }}>
                Certificate No: <strong>{cert.certificate_number}</strong> • Issued on{' '}
                <strong>{cert.adoption_date}</strong> • Application: {cert.application_code}
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: '0.96rem', marginBottom: 20 }}>
              This certifies that <strong>{cert.adopter_name}</strong> has officially adopted{' '}
              <strong>{cert.animal_name}</strong> ({cert.species_name} — {cert.breed_name}) and assumes
              compassionate lifelong care in accordance with shelter welfare standards.
            </p>

            <div className="cert-grid">
              <div className="cert-box">
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#0f5c4d' }}>Animal Profile</div>
                <div><strong>Name:</strong> {cert.animal_name}</div>
                <div><strong>Microchip ID:</strong> {cert.microchip_id}</div>
                <div><strong>Species / Breed:</strong> {cert.species_name} / {cert.breed_name}</div>
                <div><strong>Gender / Age:</strong> {cert.gender}, {cert.age_months} months</div>
                <div><strong>Weight / Sterilized:</strong> {cert.weight_kg} kg • {cert.spayed_neutered ? 'Yes' : 'No'}</div>
              </div>

              <div className="cert-box">
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#0f5c4d' }}>Adopter Details</div>
                <div><strong>Full Name:</strong> {cert.adopter_name}</div>
                <div><strong>Email:</strong> {cert.adopter_email}</div>
                <div><strong>Phone:</strong> {cert.adopter_phone}</div>
                <div><strong>Address:</strong> {cert.adopter_address}</div>
                <div><strong>Housing / Home Check:</strong> {cert.housing_type} • {cert.home_check_passed ? 'Passed' : 'Verified'}</div>
              </div>
            </div>

            <div className="cert-box" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#0f5c4d' }}>
                Medical & Vaccination Clearance Summary
              </div>
              {cert.latest_medical_clearance && (
                <div style={{ marginBottom: 8 }}>
                  <strong>Latest Vet Clearance:</strong> {cert.latest_medical_clearance.visit_date} —{' '}
                  {cert.latest_medical_clearance.diagnosis} (by {cert.latest_medical_clearance.vet_name})
                </div>
              )}
              {cert.vaccinations.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Vaccine</th>
                      <th>Administered</th>
                      <th>Next Booster Due</th>
                      <th>Batch</th>
                      <th>Veterinarian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cert.vaccinations.map((v, idx) => (
                      <tr key={idx}>
                        <td>{v.vaccine_name}</td>
                        <td>{v.administered_date}</td>
                        <td>{v.next_due_date}</td>
                        <td>{v.batch_number}</td>
                        <td>{v.administered_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div>No vaccination records on file.</div>
              )}
            </div>

            <div style={{ fontSize: '0.82rem', color: '#5a6c63' }}>
              <strong>Adoption Fee Paid:</strong> ₹{Number(cert.adoption_fee || 0).toFixed(2)} •{' '}
              <strong>Follow-Up Schedule:</strong> {cert.scheduled_followups.length} post-adoption welfare checks registered.
            </div>

            <div className="cert-signatures">
              <div className="sig-line">{cert.issued_by}<br />Authorized Shelter Officer</div>
              <div className="sig-line">{cert.adopter_name}<br />Adopter Signature</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
