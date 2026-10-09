import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Stethoscope, LayoutDashboard, Calendar, ClipboardList, LogOut, User } from 'lucide-react';
import MyPortal from './MyPortal';
import MyAppointments from './MyAppointments';
import MyTreatmentPlan from './MyTreatmentPlan';

export default function PatientPortalLayout() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('portal'); // 'portal' | 'appointments' | 'treatment'

  const navigateTo = (tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-18 py-3">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20">
                <Stethoscope size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-lg text-ink-900 tracking-tight">DentalFlow</span>
                  <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 tracking-wider">
                    Patient Portal
                  </span>
                </div>
                <p className="text-xs text-slate-500">Downtown Dental Clinic</p>
              </div>
            </div>

            {/* Navigation Tabs - Exactly 3 sections per PDF */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('portal')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'portal'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <LayoutDashboard size={16} />
                My Portal
              </button>
              <button
                onClick={() => setActiveTab('appointments')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'appointments'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Calendar size={16} />
                My Appointments
              </button>
              <button
                onClick={() => setActiveTab('treatment')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'treatment'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <ClipboardList size={16} />
                My Treatment Plan
              </button>
            </nav>

            {/* User Profile & Sign Out */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-8 h-8 rounded-lg bg-teal-600/10 text-teal-700 font-semibold text-xs flex items-center justify-center">
                  <User size={16} />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-slate-800 leading-tight">
                    {user?.display_name || user?.username}
                  </p>
                  <p className="text-[10px] text-teal-600 font-medium">Verified Patient</p>
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
          </div>

          {/* Mobile Navigation bar */}
          <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-100">
            <button
              onClick={() => setActiveTab('portal')}
              className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg ${
                activeTab === 'portal' ? 'text-teal-600 font-semibold' : 'text-slate-500'
              }`}
            >
              <LayoutDashboard size={18} />
              My Portal
            </button>
            <button
              onClick={() => setActiveTab('appointments')}
              className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg ${
                activeTab === 'appointments' ? 'text-teal-600 font-semibold' : 'text-slate-500'
              }`}
            >
              <Calendar size={18} />
              Appointments
            </button>
            <button
              onClick={() => setActiveTab('treatment')}
              className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg ${
                activeTab === 'treatment' ? 'text-teal-600 font-semibold' : 'text-slate-500'
              }`}
            >
              <ClipboardList size={18} />
              Treatment
            </button>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'portal' && <MyPortal onNavigate={navigateTo} />}
        {activeTab === 'appointments' && <MyAppointments />}
        {activeTab === 'treatment' && <MyTreatmentPlan onBookAppointment={() => navigateTo('appointments')} />}
      </main>

      {/* Patient Portal Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <p>DentalFlow Patient Portal · 120 Main Street, Downtown · Call (555) 0100</p>
      </footer>
    </div>
  );
}
