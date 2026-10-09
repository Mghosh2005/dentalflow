import {
  LayoutGrid, Calendar, Users, Inbox, Send,
  FileText, Mic, Sparkles, GraduationCap, LineChart, Stethoscope, Settings, LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  {
    section: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutGrid }],
  },
  {
    section: 'Operations',
    items: [
      { key: 'appointments', label: 'Appointments', icon: Calendar },
      { key: 'patients', label: 'Patients', icon: Users },
      { key: 'inbox', label: 'Inbox', icon: Inbox },
      { key: 'followups', label: 'Follow-ups', icon: Send },
    ],
  },
  {
    section: 'AI Tools',
    items: [
      { key: 'ai-settings', label: 'AI Settings', icon: Settings },
      { key: 'ai-assistant', label: 'AI Assistant', icon: Sparkles },
      { key: 'call-summary', label: 'AI Call Summary', icon: FileText },
      { key: 'voice-notes', label: 'Voice Notes', icon: Mic, comingSoon: true },
    ],
  },
  {
    section: 'Management',
    items: [
      { key: 'practitioners', label: 'Practitioners', icon: GraduationCap },
      { key: 'analytics', label: 'Analytics', icon: LineChart },
    ],
  },
];

export default function Sidebar({ current, onNavigate }) {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 shrink-0 bg-[#0E1726] text-white h-screen sticky top-0 flex flex-col shadow-xl z-20">
      {/* Brand header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500 text-ink-950 flex items-center justify-center font-bold">
            <Stethoscope size={19} />
          </div>
          <div>
            <span className="font-display font-bold text-lg tracking-tight block leading-tight">DentalFlow</span>
            <span className="text-[10px] text-teal-400 font-medium tracking-wide">PRACTICE SUITE</span>
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="px-3 mb-2 text-[11px] text-white/40 uppercase font-bold tracking-wider">{group.section}</p>
            <div className="space-y-1">
              {group.items.map(({ key, label, icon: Icon, comingSoon }) => {
                const active = current === key;
                return (
                  <button
                    key={key}
                    onClick={() => onNavigate(key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all
                      ${active
                        ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                        : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                  >
                    <Icon size={18} className={active ? 'text-white' : 'text-white/60'} />
                    <span className="flex-1 text-left">{label}</span>
                    {comingSoon && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/10 text-white/50">Coming Soon</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Footer */}
      <div className="px-4 py-4 border-t border-white/10 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
            {user?.display_name ? user.display_name.slice(0, 2).toUpperCase() : 'SM'}
          </div>
          <div className="leading-tight truncate">
            <p className="text-xs font-bold text-white truncate">{user?.display_name || 'Dr. Sarah Mitchell'}</p>
            <p className="text-[10px] text-teal-400 font-medium">Owner Admin</p>
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="text-white/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
