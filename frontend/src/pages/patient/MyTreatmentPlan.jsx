import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { ClipboardList, Stethoscope, Calendar, Clock, CheckCircle2, AlertCircle, ArrowRight, Activity, FileText } from 'lucide-react';

const statusConfig = {
  in_progress: {
    label: 'In Progress',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    progress: 50,
  },
  planned: {
    label: 'Planned',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    progress: 15,
  },
  completed: {
    label: 'Completed',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    progress: 100,
  },
  on_hold: {
    label: 'On Hold',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    progress: 25,
  },
};

export default function MyTreatmentPlan({ onBookAppointment }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await api.getPatientTreatmentPlans();
      setPlans(res || []);
    } catch (err) {
      setError(err.message || 'Failed to load treatment plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-10 h-10 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500 font-medium">Loading your treatment plans...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-teal-600">Clinical Overview</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            My Treatment Plan
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Review your personalized dental care roadmap, upcoming procedures, and post-treatment recommendations prescribed by your clinical team.
          </p>
        </div>
        <button
          onClick={onBookAppointment}
          className="self-start md:self-auto shrink-0 bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-2xl font-semibold text-sm shadow-md shadow-teal-600/20 flex items-center gap-2 transition-all"
        >
          <span>Schedule Visit</span>
          <ArrowRight size={16} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-3">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Treatment Plans List */}
      <div className="space-y-6">
        {plans.map((tp) => {
          const config = statusConfig[tp.status] || statusConfig.planned;
          return (
            <div
              key={tp.id}
              className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm hover:border-teal-200 transition-all"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                    <ClipboardList size={22} />
                  </div>
                  <div>
                    <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                      {tp.plan_name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Procedure: <strong className="text-slate-700">{tp.procedure_name || 'General Dental Treatment'}</strong>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${config.badgeClass}`}>
                    {config.label}
                  </span>
                </div>
              </div>

              {/* Progress Indicator */}
              <div className="py-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
                  <span>Treatment Progress</span>
                  <span>{config.progress}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 rounded-full transition-all duration-500"
                    style={{ width: `${config.progress}%` }}
                  />
                </div>
              </div>

              {/* Grid Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3">
                  <Stethoscope size={20} className="text-teal-600 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dentist in Charge</p>
                    <p className="text-sm font-bold text-slate-800">{tp.practitioner_name || 'Dr. Sarah Mitchell'}</p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3">
                  <Calendar size={20} className="text-cyan-600 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Timeline</p>
                    <p className="text-sm font-bold text-slate-800">
                      {tp.start_date || 'Current'} → {tp.end_date || 'Target Complete'}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3 sm:col-span-2 lg:col-span-1">
                  <Activity size={20} className="text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Current Phase</p>
                    <p className="text-sm font-bold text-slate-800 capitalize">{tp.status?.replace('_', ' ') || 'Active'}</p>
                  </div>
                </div>
              </div>

              {/* Clinical Notes & Instructions */}
              {tp.notes && (
                <div className="mt-5 p-4 rounded-2xl bg-teal-50/40 border border-teal-600/15">
                  <div className="flex items-center gap-2 mb-1.5 text-teal-800">
                    <FileText size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Clinical Notes & Patient Instructions</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                    {tp.notes}
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {plans.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <ClipboardList size={28} />
            </div>
            <h3 className="font-display font-semibold text-lg text-slate-800">No active treatment plans</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
              You do not have any complex treatment plans on file. Regular routine check-ups and cleanings help maintain optimal oral health!
            </p>
            <button
              onClick={onBookAppointment}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
            >
              Book a Routine Check-up
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
