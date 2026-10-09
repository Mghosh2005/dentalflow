import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import PatientPortalLayout from './pages/patient/PatientPortalLayout';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Appointments from './pages/Appointments';
import Patients from './pages/Patients';
import Inbox from './pages/Inbox';
import FollowUps from './pages/FollowUps';
import Alerts from './pages/Alerts';
import Practitioners from './pages/Practitioners';
import Analytics from './pages/Analytics';
import ComingSoon from './pages/ComingSoon';
import AiSettings from './pages/AiSettings';
import AiCallSummary from './pages/AiCallSummary';
import AiAssistant from './pages/AiAssistant';

const TITLES = {
  'voice-notes': 'Voice notes',
};

function AppContent() {
  const { user, isPatient, loading } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [alertsMode, setAlertsMode] = useState(false);

  const navigate = (key) => {
    if (key === 'alerts') {
      setAlertsMode(true);
      return;
    }
    setAlertsMode(false);
    setPage(key);
  };

  // 1. Loading state during session verification
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loading DentalFlow...</p>
      </div>
    );
  }

  // 2. Unauthenticated -> Show Login Screen
  if (!user) {
    return <Login />;
  }

  // 3. Patient role -> Show dedicated Patient Portal (3 sections ONLY per PDF)
  if (isPatient) {
    return <PatientPortalLayout />;
  }

  // 4. Staff / Owner role -> Full Practice Management Suite
  let content;
  if (alertsMode) content = <Alerts />;
  else if (page === 'dashboard') content = <Dashboard onNavigate={navigate} />;
  else if (page === 'appointments') content = <Appointments />;
  else if (page === 'patients') content = <Patients />;
  else if (page === 'inbox') content = <Inbox />;
  else if (page === 'followups') content = <FollowUps />;
  else if (page === 'practitioners') content = <Practitioners />;
  else if (page === 'analytics') content = <Analytics />;
  else if (page === 'ai-settings') content = <AiSettings />;
  else if (page === 'call-summary') content = <AiCallSummary onNavigate={navigate} />;
  else if (page === 'ai-assistant') content = <AiAssistant onNavigate={navigate} />;
  else content = <ComingSoon title={TITLES[page] || 'Coming soon'} />;

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <Sidebar current={alertsMode ? '' : page} onNavigate={navigate} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onNavigateAlerts={() => navigate('alerts')} />
        <main className="flex-1 p-6 sm:p-8 overflow-y-auto">{content}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
