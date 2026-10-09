import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Clock, User, Stethoscope, Plus, Trash2, DollarSign, Calendar, Search, Filter } from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

const statusStyles = {
  booked: 'bg-sky-100 text-sky-800 border border-sky-200',
  completed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  missed: 'bg-rose-100 text-rose-800 border border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border border-slate-200',
};

const COMMON_TYPES = [
  'Routine Check-up',
  'Dental Hygiene & Cleaning',
  'Teeth Whitening',
  'Extraction',
  'Cavity Filling / Composite Resin',
  'Root Canal Treatment',
  'Orthodontic / Invisalign Consult',
  'Crown / Bridge Preparation',
  'Emergency Dental Consultation'
];

export default function Appointments() {
  const [appts, setAppts] = useState([]);
  const [patients, setPatients] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const load = () => api.getAppointments().then((data) => setAppts(data || []));

  useEffect(() => {
    load();
    api.getPatients().then((p) => setPatients(p || []));
    api.getPractitioners().then((pr) => setPractitioners(pr || []));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const feeVal = parseFloat(form.get('fee'));
    if (!Number.isFinite(feeVal) || feeVal < 0) {
      alert('Please enter a valid fee (0 or greater).');
      return;
    }
    setSaving(true);
    const date = form.get('date');
    const time = form.get('time');
    const durationMins = parseInt(form.get('duration') || '30', 10);
    const start = `${date}T${time}:00`;

    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + durationMins * 60000);
    const end = endDate.toISOString().slice(0, 19);

    await api.createAppointment({
      patient_id: Number(form.get('patient_id')),
      practitioner_id: Number(form.get('practitioner_id')),
      start_time: start,
      end_time: end,
      reason: form.get('reason'),
      fee: feeVal,
    });
    setSaving(false);
    setShowAdd(false);
    load();
  };

  const changeStatus = async (id, status) => {
    await api.updateAppointment(id, { status });
    load();
  };

  const changeFee = async (id, feeStr) => {
    const feeVal = parseFloat(feeStr);
    if (!Number.isFinite(feeVal) || feeVal < 0) return;
    await api.updateAppointment(id, { fee: feeVal });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Are you sure you want to delete this appointment?')) return;
    await api.deleteAppointment(id);
    load();
  };

  // Helper to calculate duration from start and end time
  const getDuration = (appt) => {
    if (appt.start_time && appt.end_time) {
      const diffMs = new Date(appt.end_time) - new Date(appt.start_time);
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins > 0 && diffMins <= 240) return `${diffMins} min`;
    }
    return '30 min';
  };

  // Filtered appointments
  const filteredAppts = appts.filter((a) => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const patientMatch = a.patient_name?.toLowerCase().includes(q);
      const practMatch = a.practitioner_name?.toLowerCase().includes(q);
      const reasonMatch = a.reason?.toLowerCase().includes(q);
      return patientMatch || practMatch || reasonMatch;
    }
    return true;
  });

  return (
    <div className="max-w-5xl space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
            Appointments
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Manage all scheduled, completed, and missed patient visits.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="shrink-0 flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20 active:scale-95"
        >
          <Plus size={16} /> Book Appointment
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient, doctor, or treatment..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 text-slate-800 font-medium"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
          {['all', 'booked', 'completed', 'missed', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all shrink-0 ${
                filterStatus === st
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Appointment Cards List - Simple, easy-to-scan layout per PDF */}
      <div className="space-y-3">
        {filteredAppts.map((a) => {
          const startDate = new Date(a.start_time);
          const durationStr = getDuration(a);

          return (
            <div
              key={a.id}
              className="bg-white rounded-2xl border border-slate-200/90 hover:border-teal-300 p-5 shadow-xs hover:shadow-md transition-all group"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Left section: Time, Patient Name & Treatment */}
                <div className="flex items-start sm:items-center gap-4">
                  {/* Date badge */}
                  <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 text-teal-800 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      {startDate.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className="text-xl font-extrabold leading-none my-0.5">
                      {startDate.toLocaleDateString('en-US', { day: 'numeric' })}
                    </span>
                    <span className="text-[10px] text-teal-600 font-medium">
                      {startDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </div>

                  {/* Main Details: Visual prominence on patient and doctor per PDF */}
                  <div className="space-y-1">
                    {/* Patient Name - Prominent bold font */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                        <User size={16} className="text-teal-600 shrink-0" />
                        {a.patient_name}
                      </h3>

                      {/* Appointment / Treatment Type Badge */}
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100/70 text-teal-800 border border-teal-200/60">
                        {a.reason || 'Routine Check-up'}
                      </span>

                      {/* AI booked indicator if applicable */}
                      {a.booked_by_ai === 1 && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800">
                          AI Booked
                        </span>
                      )}
                    </div>

                    {/* Practitioner Name and Duration */}
                    <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap pt-0.5">
                      {/* Practitioner Name - Prominently highlighted */}
                      <span className="inline-flex items-center gap-1.5 font-bold text-teal-800 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                        <Stethoscope size={13} className="text-teal-600" />
                        {a.practitioner_name}
                      </span>

                      {/* Time */}
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Clock size={13} className="text-slate-400" />
                        {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>

                      {/* Duration per PDF */}
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                        ⏱ Duration: {durationStr}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right section: Fee, Status Selector & Delete */}
                <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                  {/* Fee input */}
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-xs font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={a.fee ?? ''}
                      onBlur={(e) => changeFee(a.id, e.target.value)}
                      className="w-14 text-xs font-bold text-slate-800 bg-transparent focus:outline-none"
                    />
                  </div>

                  {/* Status Dropdown */}
                  <select
                    value={a.status}
                    onChange={(e) => changeStatus(a.id, e.target.value)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl capitalize focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all cursor-pointer ${statusStyles[a.status]}`}
                  >
                    <option value="booked">Booked</option>
                    <option value="completed">Completed</option>
                    <option value="missed">Missed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>

                  {/* Delete button */}
                  <button
                    onClick={() => remove(a.id)}
                    title="Delete appointment"
                    className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredAppts.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
            <Calendar size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No appointments found</p>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your filter or search query.
            </p>
          </div>
        )}
      </div>

      {/* Book Appointment Modal */}
      {showAdd && (
        <Modal title="Book New Appointment" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <Field label="Patient">
              <select name="patient_id" required className={inputClass}>
                <option value="">Select a patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.phone ? `(${p.phone})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Practitioner">
              <select name="practitioner_id" required className={inputClass}>
                <option value="">Select a practitioner</option>
                {practitioners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.specialty || 'Dentist'}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Appointment / Treatment Type">
              <select name="reason" required className={inputClass}>
                {COMMON_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Date">
                <input
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Time">
                <input
                  name="time"
                  type="time"
                  defaultValue="09:00"
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Duration">
                <select name="duration" defaultValue="30" className={inputClass}>
                  <option value="15">15 mins</option>
                  <option value="30">30 mins</option>
                  <option value="45">45 mins</option>
                  <option value="60">60 mins</option>
                  <option value="90">90 mins</option>
                </select>
              </Field>
            </div>

            <Field label="Fee ($)">
              <input
                name="fee"
                type="number"
                min="0"
                step="0.01"
                defaultValue="150.00"
                required
                className={inputClass}
                placeholder="150.00"
              />
            </Field>

            <SubmitButton disabled={saving}>
              {saving ? 'Booking...' : 'Confirm Appointment'}
            </SubmitButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
