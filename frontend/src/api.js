const BASE_URL = '/api';

let memoryCsrfToken = '';

export function setCsrfToken(token) {
  memoryCsrfToken = token || '';
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCookie('pawhaven_csrf') || memoryCsrfToken;
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    method,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (data && data.detail) || (typeof data === 'string' ? data : 'Request failed');
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  // Authentication
  register: (payload) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: async (payload) => {
    const res = await request('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    if (res?.csrf_token) setCsrfToken(res.csrf_token);
    return res;
  },
  logout: async () => {
    try {
      return await request('/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken('');
    }
  },
  me: async () => {
    const res = await request('/auth/me');
    if (res?.csrf_token) setCsrfToken(res.csrf_token);
    return res;
  },

  // Admin User Management
  getAdminUsers: () => request('/admin/users'),
  createAdminUser: (payload) =>
    request('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateAdminUserStatus: (userId, isActive) =>
    request(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    }),
  updateAdminUserRole: (userId, roleName) =>
    request(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role_name: roleName }),
    }),

  // Dashboard & Shelter Metadata
  getDashboard: () => request('/dashboard'),
  getAdopterDashboard: () => request('/dashboard/adopter'),
  getMetadata: () => request('/shelter/metadata'),
  getZones: () => request('/shelter/zones'),

  // Animals & Intake
  getAnimals: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return request(`/animals${qs ? `?${qs}` : ''}`);
  },
  getAnimalDetail: (id) => request(`/animals/${id}`),
  getIntakes: () => request('/animals/intakes'),
  createIntakeAndAnimal: (payload) =>
    request('/animals/intake', { method: 'POST', body: JSON.stringify(payload) }),
  updateAnimal: (id, payload) =>
    request(`/animals/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  relocateAnimalZone: (id, zoneId) =>
    request(`/animals/${id}/zone`, { method: 'PATCH', body: JSON.stringify({ zone_id: zoneId }) }),
  updateAnimalStatus: (id, payload) =>
    request(`/animals/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAnimal: (id) =>
    request(`/animals/${id}`, { method: 'DELETE' }),

  // Medical & Vaccinations
  getMedicalRecords: (animalId) =>
    request(`/medical/records${animalId ? `?animal_id=${animalId}` : ''}`),
  createMedicalRecord: (payload) =>
    request('/medical/records', { method: 'POST', body: JSON.stringify(payload) }),
  getVaccinations: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return request(`/medical/vaccinations${qs ? `?${qs}` : ''}`);
  },
  createVaccination: (payload) =>
    request('/medical/vaccinations', { method: 'POST', body: JSON.stringify(payload) }),
  syncVaccineExpiry: (refDate) =>
    request(`/medical/vaccinations/sync-expiry${refDate ? `?reference_date=${refDate}` : ''}`, {
      method: 'POST',
    }),

  // Adopters, Applications, Matchmaking & Follow-ups
  getMyProfile: () => request('/adoptions/my-profile'),
  updateMyProfile: (payload) =>
    request('/adoptions/my-profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  getAdopters: () => request('/adoptions/adopters'),
  createAdopter: (payload) =>
    request('/adoptions/adopters', { method: 'POST', body: JSON.stringify(payload) }),
  updateAdopterStatus: (id, status) =>
    request(`/adoptions/adopters/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getMatchmaking: (adopterId) =>
    request(`/adoptions/matchmaking${adopterId ? `?adopter_id=${adopterId}` : ''}`),

  getApplications: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return request(`/adoptions/applications${qs ? `?${qs}` : ''}`);
  },
  createApplication: (payload) =>
    request('/adoptions/applications', { method: 'POST', body: JSON.stringify(payload) }),
  updateApplicationStatus: (id, payload) =>
    request(`/adoptions/applications/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
  finalizeApplication: (id, payload) =>
    request(`/adoptions/applications/${id}/finalize`, { method: 'POST', body: JSON.stringify(payload) }),

  getPlacements: () => request('/adoptions/placements'),
  getFollowups: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return request(`/adoptions/followups${qs ? `?${qs}` : ''}`);
  },
  addFollowup: (placementId, payload) =>
    request(`/adoptions/placements/${placementId}/followups`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  completeFollowup: (id, payload) =>
    request(`/adoptions/followups/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Reports & Certificates
  getCertificate: (placementId) => request(`/reports/certificates/${placementId}`),
  getOccupancyReport: () => request('/reports/occupancy'),
  getHealthReport: () => request('/reports/health'),
};
