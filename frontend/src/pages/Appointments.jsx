import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Clock, User, Stethoscope, Plus, Trash2, DollarSign } from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

const statusStyles = {
  booked: 'bg-teal-100 text-teal-600',
  completed: 'bg-ink-900/5 text-ink-900/60',
  missed: 'bg-clay-100 text-clay-600',
  cancelled: 'bg-ink-900/5 text-ink-900/40',
};

export default function Appointments() {
  const [appts, setAppts] = useState([]);
  const [patients, setPatients] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api.getAppointments().then(setAppts);
  useEffect(() => {
    load();
    api.getPatients().then(setPatients);
    api.getPractitioners().then(setPractitioners);
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
    const start = `${date}T${time}:00`;
    await api.createAppointment({
      patient_id: Number(form.get('patient_id')),
      practitioner_id: Number(form.get('practitioner_id')),
      start_time: start,
      end_time: start,
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
    if (!Number.isFinite(feeVal) || feeVal < 0) return; // ignore invalid edits silently
    await api.updateAppointment(id, { fee: feeVal });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Delete this appointment?')) return;
    await api.deleteAppointment(id);
    load();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Appointments</h1>
          <p className="text-ink-900/50 text-sm">All scheduled, completed, and missed appointments.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-ink-900 text-white hover:bg-ink-800 transition-colors"
        >
          <Plus size={15} /> Book appointment
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-black/5">
        {appts.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-5 py-4 group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center">
                <Clock size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-900">
                  {new Date(a.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
                <p className="text-xs text-ink-900/50 flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1"><User size={12} /> {a.patient_name}</span>
                  <span className="flex items-center gap-1"><Stethoscope size={12} /> {a.practitioner_name}</span>
                  <span className="flex items-center gap-1"><DollarSign size={12} /> ${a.fee != null ? a.fee : '—'}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs text-ink-900/40">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={a.fee ?? ''}
                  onBlur={(e) => changeFee(a.id, e.target.value)}
                  className="w-16 text-xs px-1.5 py-1 rounded border border-black/10 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                />
              </div>
              <select
                value={a.status}
                onChange={(e) => changeStatus(a.id, e.target.value)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize border-0 focus:outline-none focus:ring-2 focus:ring-teal-500/30 ${statusStyles[a.status]}`}
              >
                <option value="booked">Booked</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={() => remove(a.id)} className="text-ink-900/30 hover:text-clay-600 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {appts.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink-900/40">No appointments yet.</p>}
      </div>

      {showAdd && (
        <Modal title="Book appointment" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd}>
            <Field label="Patient">
              <select name="patient_id" required className={inputClass}>
                <option value="">Select a patient</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Practitioner">
              <select name="practitioner_id" required className={inputClass}>
                <option value="">Select a practitioner</option>
                {practitioners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input name="date" type="date" required className={inputClass} />
              </Field>
              <Field label="Time">
                <input name="time" type="time" required className={inputClass} />
              </Field>
            </div>
            <Field label="Reason">
              <input name="reason" className={inputClass} placeholder="Checkup, hygiene, consult…" />
            </Field>
            <Field label="Fee ($)">
              <input name="fee" type="number" min="0" step="0.01" required className={inputClass} placeholder="150.00" />
            </Field>
            <SubmitButton disabled={saving}>{saving ? 'Saving…' : 'Book appointment'}</SubmitButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
