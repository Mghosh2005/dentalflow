import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Check, Plus } from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

const typeLabels = {
  recall: 'Hygiene recall',
  no_show_rebook: 'No-show rebooking',
  pending_message: 'Message approval',
  consult_followup: 'Consultation follow-up',
};

export default function FollowUps() {
  const [items, setItems] = useState([]);
  const [patients, setPatients] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api.getFollowUps().then(setItems);
  useEffect(() => { load(); api.getPatients().then(setPatients); }, []);

  const complete = async (id) => {
    await api.completeFollowUp(id);
    load();
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.target);
    await api.createFollowUp({
      patient_id: Number(form.get('patient_id')),
      type: form.get('type'),
      priority: form.get('priority'),
      due_date: form.get('due_date'),
      notes: form.get('notes'),
    });
    setSaving(false);
    setShowAdd(false);
    load();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Follow-ups</h1>
          <p className="text-ink-900/50 text-sm">{items.length} pending items across patients.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-ink-900 text-white hover:bg-ink-800 transition-colors"
        >
          <Plus size={15} /> Add follow-up
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-black/5">
        {items.map((f) => (
          <div key={f.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                  ${f.priority === 'high' ? 'bg-clay-100 text-clay-600' : 'bg-ink-900/[0.06] text-ink-900/60'}`}>
                  {f.priority === 'high' ? 'High' : 'Medium'}
                </span>
                <p className="text-sm font-medium text-ink-900">{typeLabels[f.type] || f.type}</p>
              </div>
              <p className="text-xs text-ink-900/50">{f.patient_name} · {f.notes}</p>
            </div>
            <button
              onClick={() => complete(f.id)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-black/10 text-ink-900/70 hover:bg-teal-100 hover:text-teal-600 hover:border-teal-600/20 transition-colors"
            >
              <Check size={13} /> Mark done
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink-900/40">All caught up — no pending follow-ups.</p>}
      </div>

      {showAdd && (
        <Modal title="Add follow-up" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd}>
            <Field label="Patient">
              <select name="patient_id" required className={inputClass}>
                <option value="">Select a patient</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select name="type" required className={inputClass}>
                <option value="recall">Hygiene recall</option>
                <option value="no_show_rebook">No-show rebooking</option>
                <option value="pending_message">Message approval</option>
                <option value="consult_followup">Consultation follow-up</option>
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" className={inputClass} defaultValue="medium">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="Due date">
              <input name="due_date" type="date" className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
            <SubmitButton disabled={saving}>{saving ? 'Saving…' : 'Add follow-up'}</SubmitButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
