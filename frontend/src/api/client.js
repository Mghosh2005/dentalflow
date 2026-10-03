const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${path}`);
  return res.json();
}

export const api = {
  getDashboardSummary: () => request('/api/dashboard/summary'),
  getAlerts: () => request('/api/alerts'),
  dismissAlert: (id) => request(`/api/alerts/${id}/dismiss`, { method: 'POST' }),
  getSuggestedActions: () => request('/api/suggested-actions'),
  getAppointments: (date) => request(`/api/appointments${date ? `?date=${date}` : ''}`),
  createAppointment: (data) => request('/api/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id, data) => request(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAppointment: (id) => request(`/api/appointments/${id}`, { method: 'DELETE' }),
  getPatients: () => request('/api/patients'),
  createPatient: (data) => request('/api/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, data) => request(`/api/patients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePatient: (id) => request(`/api/patients/${id}`, { method: 'DELETE' }),
  getPractitioners: () => request('/api/practitioners'),
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
};


