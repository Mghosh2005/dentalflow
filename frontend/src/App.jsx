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
import AiSettings from './pages/AiSettings';
import AiCallSummary from './pages/AiCallSummary';
import AiAssistant from './pages/AiAssistant';

const TITLES = {
  'voice-notes': 'Voice notes',
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
  else if (page === 'ai-settings') content = <AiSettings />;
  else if (page === 'call-summary') content = <AiCallSummary onNavigate={navigate} />;
  else if (page === 'ai-assistant') content = <AiAssistant onNavigate={navigate} />;
  else content = <ComingSoon title={TITLES[page] || 'Coming soon'} />;


  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">
      <Sidebar current={alertsMode ? '' : page} onNavigate={navigate} />
      <main className="flex-1 p-8">{content}</main>
    </div>
  );
}
