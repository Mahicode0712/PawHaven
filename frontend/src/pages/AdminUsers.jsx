import React, { useEffect, useState } from 'react';
import { Plus, Shield, UserCheck, UserX } from 'lucide-react';
import { api } from '../api';
import { Modal } from '../components/Modal';

const ROLE_BADGE = {
  ADMIN: 'badge-danger',
  SHELTER_STAFF: 'badge-info',
  ADOPTER: 'badge-success',
};

export function AdminUsers({ currentUser, refreshTick, onChanged }) {
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role_name: 'SHELTER_STAFF',
  });

  const loadUsers = () => {
    api
      .getAdminUsers()
      .then(setUsers)
      .catch((err) => setFeedback({ type: 'danger', text: err.message }));
  };

  useEffect(() => {
    loadUsers();
  }, [refreshTick]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', text: '' });
    try {
      const created = await api.createAdminUser(form);
      setShowCreate(false);
      setForm({ full_name: '', email: '', password: '', role_name: 'SHELTER_STAFF' });
      setFeedback({ type: 'success', text: `Created ${created.role} account for ${created.email}.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleToggleStatus = async (user) => {
    setFeedback({ type: '', text: '' });
    try {
      const updated = await api.updateAdminUserStatus(user.user_id, !user.is_active);
      setFeedback({
        type: 'success',
        text: `${updated.email} is now ${updated.is_active ? 'active' : 'deactivated'}.`,
      });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  const handleRoleChange = async (user, roleName) => {
    setFeedback({ type: '', text: '' });
    try {
      const updated = await api.updateAdminUserRole(user.user_id, roleName);
      setFeedback({ type: 'success', text: `Updated ${updated.email} role to ${updated.role}.` });
      onChanged();
    } catch (err) {
      setFeedback({ type: 'danger', text: err.message });
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">User & Staff Management</h1>
          <p className="page-subtitle">
            Admin-only RBAC directory: provision Shelter Staff & Admin accounts, manage roles, and deactivate accounts
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Provision Staff / User
        </button>
      </div>

      {feedback.text && <div className={`alert-banner alert-${feedback.type}`}>{feedback.text}</div>}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Role Assignment</th>
              <th>Account Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.user_id === currentUser.user_id;
              return (
                <tr key={u.user_id}>
                  <td>#{u.user_id}</td>
                  <td>
                    <strong>{u.full_name}</strong>
                    {isSelf && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>You</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`badge ${ROLE_BADGE[u.role] || 'badge-neutral'}`}>
                      <Shield size={11} /> {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.created_at}</td>
                  <td>
                    <select
                      className="select"
                      style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                      disabled={isSelf}
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="SHELTER_STAFF">SHELTER_STAFF</option>
                      <option value="ADOPTER">ADOPTER</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-primary'}`}
                      disabled={isSelf}
                      onClick={() => handleToggleStatus(u)}
                    >
                      {u.is_active ? <><UserX size={13} /> Deactivate</> : <><UserCheck size={13} /> Activate</>}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Modal title="Provision New User Account (Admin Only)" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="form-field">
                <label>Full Name *</label>
                <input
                  className="input"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Email *</label>
                <input
                  type="email"
                  className="input"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Initial Password *</label>
                <input
                  type="password"
                  className="input"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="8+ chars, upper/lower/digit/symbol"
                />
              </div>
              <div className="form-field">
                <label>Role *</label>
                <select
                  className="select"
                  value={form.role_name}
                  onChange={(e) => setForm({ ...form, role_name: e.target.value })}
                >
                  <option value="SHELTER_STAFF">SHELTER_STAFF</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="ADOPTER">ADOPTER</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Account</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
