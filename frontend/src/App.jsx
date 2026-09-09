import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Appointments from './pages/Appointments';
import Patients from './pages/Patients';
import Inbox from './pages/Inbox';
import FollowUps from './pages/FollowUps';
import Alerts from './pages/Alerts';
import Practitioners from './pages/Practitioners';
import Analytics from './pages/Analytics';
import ComingSoon from './pages/ComingSoon';

const TITLES = {
  'call-summary': 'AI call summary',
  'voice-notes': 'Voice notes',
  'ai-assistant': 'AI assistant',
};

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [alertsMode, setAlertsMode] = useState(false);

  const navigate = (key) => {
    if (key === 'alerts') { setAlertsMode(true); return; }
    setAlertsMode(false);
    setPage(key);
  };

  let content;
  if (alertsMode) content = <Alerts />;
  else if (page === 'dashboard') content = <Dashboard onNavigate={navigate} />;
  else if (page === 'appointments') content = <Appointments />;
  else if (page === 'patients') content = <Patients />;
  else if (page === 'inbox') content = <Inbox />;
  else if (page === 'followups') content = <FollowUps />;
  else if (page === 'practitioners') content = <Practitioners />;
  else if (page === 'analytics') content = <Analytics />;
  else content = <ComingSoon title={TITLES[page] || 'Coming soon'} />;

  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">
      <Sidebar current={alertsMode ? '' : page} onNavigate={navigate} />
      <main className="flex-1 p-8">{content}</main>
    </div>
  );
}
