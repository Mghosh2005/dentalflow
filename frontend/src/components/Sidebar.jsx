import { useEffect, useCallback } from 'react';
import {
  LayoutGrid, Calendar, Users, Inbox, Send,
  FileText, Mic, Sparkles, GraduationCap, LineChart, Stethoscope, Settings, LogOut, Menu, X, Scan
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  {
    section: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutGrid }],
  },
  {
    section: 'Clinical Intelligence',
    items: [
      { key: 'imaging', label: 'Imaging Workspace', icon: Scan },
    ],
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

function SidebarContent({ current, onNavigate, onItemClick }) {
  const { user, logout } = useAuth();

  const handleNav = (key) => {
    onNavigate(key);
    if (onItemClick) onItemClick();
  };

  return (
    <>
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
                    onClick={() => handleNav(key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px]
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
          className="text-white/40 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <LogOut size={16} />
        </button>
      </div>
    </>
  );
}

export default function Sidebar({ current, onNavigate, mobileOpen, onMobileClose }) {
  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = orig; };
    }
  }, [mobileOpen]);

  // Close on Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && mobileOpen) {
      onMobileClose();
    }
  }, [mobileOpen, onMobileClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-[#0E1726] text-white h-screen sticky top-0 flex-col shadow-xl z-20">
        <SidebarContent current={current} onNavigate={onNavigate} />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex"
          onClick={(e) => { if (e.target === e.currentTarget) onMobileClose(); }}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs animate-fadeIn" onClick={onMobileClose} />

          {/* Drawer */}
          <aside className="relative w-72 max-w-[85vw] bg-[#0E1726] text-white h-full flex flex-col shadow-2xl z-50 animate-slideInLeft">
            {/* Close button */}
            <button
              onClick={onMobileClose}
              className="absolute top-4 right-4 p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors z-10 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
            <SidebarContent current={current} onNavigate={onNavigate} onItemClick={onMobileClose} />
          </aside>
        </div>
      )}
    </>
  );
}

// Export the hamburger button for use in Header
export function MobileMenuButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
      aria-label="Open navigation menu"
    >
      <Menu size={20} />
    </button>
  );
}
