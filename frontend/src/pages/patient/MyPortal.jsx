import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Calendar, CheckCircle2, Clock, MapPin, Stethoscope, ArrowRight, Sparkles, Phone, AlertCircle } from 'lucide-react';

export default function MyPortal({ onNavigate }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getPatientDashboard();
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load portal data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-10 h-10 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500 font-medium">Loading your portal...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-center">
        <AlertCircle size={24} className="mx-auto mb-2 text-red-500" />
        <p className="font-semibold">{error}</p>
        <button
          onClick={loadData}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const patientName = data?.patient?.name || user?.display_name || 'Patient';
  const nextAppt = data?.next_appointment;
  const totalAppointments = data?.total_appointments ?? 0;
  const totalCompleted = data?.total_completed ?? 0;

  // Format date and time for next appointment
  const nextApptDate = nextAppt
    ? new Date(nextAppt.start_time).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const nextApptTime = nextAppt
    ? new Date(nextAppt.start_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Welcome Message & Quick Action Banner */}
      <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-teal-900/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-medium text-white mb-3">
              <Sparkles size={14} />
              <span>DentalFlow Patient Care</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              Welcome back, {patientName}!
            </h1>
            <p className="text-teal-100 text-sm sm:text-base mt-2 max-w-xl">
              We are dedicated to keeping your smile healthy and radiant. View your scheduled visits or book your next check-up below.
            </p>
          </div>
          <button
            onClick={() => onNavigate('appointments')}
            className="self-start md:self-auto shrink-0 bg-white text-teal-800 hover:bg-teal-50 px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all flex items-center gap-2 hover:gap-3"
          >
            <span>Book New Appointment</span>
            <ArrowRight size={17} />
          </button>
        </div>
      </div>

      {/* 2. Key Summary Stats (Total appointments & Completed visits) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Total Appointments */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Bookings</span>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Calendar size={20} />
            </div>
          </div>
          <p className="font-display text-3xl sm:text-4xl font-bold text-slate-800">{totalAppointments}</p>
          <p className="text-xs text-slate-500 mt-1">Total appointments booked at DentalFlow</p>
        </div>

        {/* Total Completed Visits */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Completed Visits</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <p className="font-display text-3xl sm:text-4xl font-bold text-emerald-700">{totalCompleted}</p>
          <p className="text-xs text-slate-500 mt-1">Visits completed with your care team</p>
        </div>

        {/* Practice Contact Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Clinic Support</span>
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Phone size={20} />
            </div>
          </div>
          <p className="font-display text-base font-bold text-slate-800">Downtown DentalFlow</p>
          <p className="text-xs text-slate-500 mt-1">120 Main Street, Downtown</p>
          <p className="text-xs text-teal-600 font-semibold mt-2">Mon–Fri: 8am–6pm · Sat: 9am–1pm</p>
        </div>
      </div>

      {/* 3. Next Appointment Card (Complete details per PDF) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between pb-6 border-b border-slate-100">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-600">Upcoming Visit</span>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
              Next Appointment Details
            </h2>
          </div>
          {nextAppt && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 uppercase tracking-wide">
              {nextAppt.status || 'Confirmed'}
            </span>
          )}
        </div>

        {nextAppt ? (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Date and Time */}
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Clock size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Date & Time</p>
                <p className="text-sm font-bold text-slate-900 mt-1">{nextApptDate}</p>
                <p className="text-sm font-semibold text-teal-700 mt-0.5">{nextApptTime}</p>
              </div>
            </div>

            {/* Practitioner */}
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Stethoscope size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Practitioner</p>
                <p className="text-sm font-bold text-slate-900 mt-1">{nextAppt.practitioner_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{nextAppt.practitioner_specialty || 'Dental Clinician'}</p>
              </div>
            </div>

            {/* Reason / Type of Appointment */}
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <MapPin size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Appointment Type / Reason</p>
                <p className="text-sm font-bold text-slate-900 mt-1">{nextAppt.reason || 'General Check-up'}</p>
                <p className="text-xs text-slate-500 mt-0.5">DentalFlow Downtown · Main Operatory</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <Calendar size={28} />
            </div>
            <h3 className="font-display font-semibold text-lg text-slate-800">No upcoming appointments</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
              You currently have no scheduled appointments. Keeping up with regular cleanings and check-ups is key to long-term oral health!
            </p>
            <button
              onClick={() => onNavigate('appointments')}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
            >
              Book an Appointment Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
