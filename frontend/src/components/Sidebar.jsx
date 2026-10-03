import {
  LayoutGrid, Calendar, Users, Inbox, Send,
  FileText, Mic, Sparkles, GraduationCap, LineChart, Stethoscope, Settings
} from 'lucide-react';

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
    section: 'AI tools',
    items: [
      { key: 'ai-settings', label: 'AI Settings', icon: Settings },
      { key: 'call-summary', label: 'AI call summary', icon: FileText },
      { key: 'voice-notes', label: 'Voice notes', icon: Mic, comingSoon: true },
      { key: 'ai-assistant', label: 'AI assistant', icon: Sparkles, comingSoon: true },
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
  return (
    <aside className="w-64 shrink-0 bg-ink-900 text-white h-screen sticky top-0 flex flex-col">
      <div className="px-6 py-6 flex items-center gap-2 border-b border-white/10">
        <Stethoscope size={22} className="text-teal-500" />
        <span className="font-display font-semibold text-lg tracking-tight">DentalFlow</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="px-3 mb-2 text-xs text-white/40 font-medium">{group.section}</p>
            <div className="space-y-0.5">
              {group.items.map(({ key, label, icon: Icon, comingSoon }) => {
                const active = current === key;
                return (
                  <button
                    key={key}
                    onClick={() => onNavigate(key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                      ${active ? 'bg-teal-600 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
                  >
                    <Icon size={17} />
                    <span className="flex-1 text-left">{label}</span>
                    {comingSoon && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">Phase 3</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-sm font-medium">SM</div>
        <div className="leading-tight">
          <p className="text-sm font-medium">Dr. Sarah Mitchell</p>
          <p className="text-xs text-white/40">Owner admin</p>
        </div>
      </div>
    </aside>
  );
}
