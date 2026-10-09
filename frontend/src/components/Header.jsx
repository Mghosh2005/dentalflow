import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Building2, ChevronDown, Check, LogOut, User, Bell } from 'lucide-react';

export default function Header({ onNavigateAlerts }) {
  const { user, logout, selectedPractice, setSelectedPractice } = useAuth();
  const [practices, setPractices] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    api.getPractices()
      .then((rows) => {
        if (rows && rows.length > 0) setPractices(rows);
      })
      .catch(() => {
        setPractices([
          { id: 1, name: 'DentalFlow – Downtown', address: '120 Main Street, Downtown' },
          { id: 2, name: 'DentalFlow – Westside Plaza', address: '450 West Avenue, Suite 200' },
          { id: 3, name: 'DentalFlow – North Hills', address: '88 North Hills Blvd' },
        ]);
      });

    api.getAlerts()
      .then((alerts) => {
        if (alerts) setAlertCount(alerts.length);
      })
      .catch(() => {});
  }, []);

  const handleSelectPractice = (practice) => {
    setSelectedPractice(practice);
    setDropdownOpen(false);
  };

  return (
    <header className="bg-white border-b border-slate-200 px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Left: Practice Dropdown Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-3 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100 hover:border-slate-300 transition-all text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-teal-600/10 text-teal-700 flex items-center justify-center shrink-0">
            <Building2 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800 tracking-tight">
                {selectedPractice?.name || 'DentalFlow – Downtown'}
              </span>
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-teal-100 text-teal-700">
                Active Practice
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
              {selectedPractice?.address || '120 Main Street, Downtown'}
            </p>
          </div>
          <ChevronDown size={15} className={`text-slate-400 group-hover:text-slate-600 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-scaleUp">
            <div className="px-3.5 py-2 border-b border-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Switch Practice Location
              </p>
            </div>
            <div className="py-1">
              {practices.map((p) => {
                const isSelected = selectedPractice?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPractice(p)}
                    className={`w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors ${
                      isSelected ? 'bg-teal-50/60 font-semibold' : ''
                    }`}
                  >
                    <div>
                      <p className={`text-xs ${isSelected ? 'text-teal-900 font-bold' : 'text-slate-800'}`}>
                        {p.name}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {p.address || 'DentalFlow Location'}
                      </p>
                    </div>
                    {isSelected && <Check size={16} className="text-teal-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="px-3.5 py-2 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <p className="text-[10px] text-slate-500">
                Data seamlessly loads for selected practice
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Alerts, User Profile & Logout */}
      <div className="flex items-center gap-3">
        {onNavigateAlerts && (
          <button
            onClick={onNavigateAlerts}
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors"
            title="System Alerts"
          >
            <Bell size={18} />
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {alertCount}
              </span>
            )}
          </button>
        )}

        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="w-7 h-7 rounded-lg bg-teal-600 text-white font-bold text-xs flex items-center justify-center">
            {user?.display_name ? user.display_name.slice(0, 2).toUpperCase() : 'SM'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold text-slate-800 leading-tight">
              {user?.display_name || 'Dr. Sarah Mitchell'}
            </p>
            <p className="text-[10px] text-slate-400 font-medium capitalize">
              {user?.role === 'staff' ? 'Practice Owner & Admin' : 'Staff'}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          title="Sign out"
          className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
