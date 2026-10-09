const BASE_URL = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('dentalflow_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (res.status === 401) {
    if (!path.includes('/api/auth/login')) {
      localStorage.removeItem('dentalflow_token');
      localStorage.removeItem('dentalflow_user');
      window.dispatchEvent(new Event('dentalflow_auth_expired'));
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Invalid credentials or session expired');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status} ${path}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/api/auth/me'),

  // Staff endpoints
  getDashboardSummary: () => request('/api/dashboard/summary'),
  getAlerts: () => request('/api/alerts'),
  dismissAlert: (id) => request(`/api/alerts/${id}/dismiss`, { method: 'POST' }),
  getSuggestedActions: () => request('/api/suggested-actions'),
  getAppointments: (date) => request(`/api/appointments${date ? `?date=${date}` : ''}`),
  createAppointment: (data) => request('/api/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id, data) => request(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAppointment: (id) => request(`/api/appointments/${id}`, { method: 'DELETE' }),
  getPatients: () => request('/api/patients'),
  getPatient: (id) => request(`/api/patients/${id}`),
  createPatient: (data) => request('/api/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, data) => request(`/api/patients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePatient: (id) => request(`/api/patients/${id}`, { method: 'DELETE' }),
  getPractitioners: () => request('/api/practitioners'),
  createPractitioner: (data) => request('/api/practitioners', { method: 'POST', body: JSON.stringify(data) }),
  getEnquiries: () => request('/api/enquiries'),
  createEnquiry: (data) => request('/api/enquiries', { method: 'POST', body: JSON.stringify(data) }),
  updateEnquiry: (id, data) => request(`/api/enquiries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getFollowUps: () => request('/api/follow-ups'),
  createFollowUp: (data) => request('/api/follow-ups', { method: 'POST', body: JSON.stringify(data) }),
  completeFollowUp: (id) => request(`/api/follow-ups/${id}/complete`, { method: 'POST' }),
  getAnalytics: () => request('/api/analytics'),
  getCallLogs: () => request('/api/call-logs'),
  createCallLog: (data) => request('/api/call-logs', { method: 'POST', body: JSON.stringify(data) }),
  updateCallLog: (id, data) => request(`/api/call-logs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getAiSettings: () => request('/api/ai-settings'),
  updateAiSettings: (data) => request('/api/ai-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  triggerAiBookingWebhook: (data) => request('/api/ai-booking-webhook', { method: 'POST', body: JSON.stringify(data) }),
  simulateAiChat: (data) => request('/api/simulate-ai-chat', { method: 'POST', body: JSON.stringify(data) }),
  transcribeAudio: (data) => request('/api/transcribe', { method: 'POST', body: JSON.stringify(data) }),

  // Treatment plans
  getTreatmentPlans: (patientId) => request(`/api/treatment-plans${patientId ? `?patient_id=${patientId}` : ''}`),
  createTreatmentPlan: (data) => request('/api/treatment-plans', { method: 'POST', body: JSON.stringify(data) }),
  updateTreatmentPlan: (id, data) => request(`/api/treatment-plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Follow-up messages
  getFollowUpMessages: () => request('/api/follow-up-messages'),
  updateFollowUpMessage: (id, data) => request(`/api/follow-up-messages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  sendFollowUpMessage: (id) => request(`/api/follow-up-messages/${id}/send`, { method: 'POST' }),
  cancelFollowUpMessage: (id) => request(`/api/follow-up-messages/${id}/cancel`, { method: 'POST' }),
  getMessageTemplates: () => request('/api/message-templates'),
  updateMessageTemplate: (id, data) => request(`/api/message-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Practices
  getPractices: () => request('/api/practices'),

  // Patient portal
  getPatientDashboard: () => request('/api/patient/dashboard'),
  getPatientAppointments: () => request('/api/patient/appointments'),
  getAppointmentTypes: () => request('/api/patient/appointment-types'),
  getPatientPractitioners: () => request('/api/patient/practitioners'),
  getAvailableSlots: (practitionerId, date, duration) =>
    request(`/api/patient/available-slots?practitioner_id=${practitionerId}&date=${date}&duration=${duration || 30}`),
  bookPatientAppointment: (data) => request('/api/patient/appointments', { method: 'POST', body: JSON.stringify(data) }),
  getPatientTreatmentPlans: () => request('/api/patient/treatment-plans'),
};
