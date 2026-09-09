import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Plus } from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

const statusStyles = {
  open: 'bg-ink-900/[0.06] text-ink-900/60',
  resolved: 'bg-teal-100 text-teal-600',
  missed: 'bg-clay-100 text-clay-600',
};

export default function Inbox() {
  const [enquiries, setEnquiries] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api.getEnquiries().then(setEnquiries);
  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.target);
    await api.createEnquiry({
      caller_name: form.get('caller_name'),
      source: form.get('source'),
      status: form.get('status'),
      notes: form.get('notes'),
    });
    setSaving(false);
    setShowAdd(false);
    load();
  };

  const updateStatus = async (id, status) => {
    await api.updateEnquiry(id, { status });
    load();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Inbox</h1>
          <p className="text-ink-900/50 text-sm">Enquiries from calls and the web, in one place.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-ink-900 text-white hover:bg-ink-800 transition-colors"
        >
          <Plus size={15} /> Log enquiry
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-black/5">
        {enquiries.map((e) => (
          <div key={e.id} className="px-5 py-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-ink-900">{e.caller_name || 'Unknown caller'}</p>
              <select
                value={e.status}
                onChange={(ev) => updateStatus(e.id, ev.target.value)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize border-0 focus:outline-none focus:ring-2 focus:ring-teal-500/30 ${statusStyles[e.status]}`}
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="missed">Missed</option>
              </select>
            </div>
            <p className="text-xs text-ink-900/40 mb-1.5 capitalize">{e.source} · {new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
            <p className="text-sm text-ink-900/60">{e.notes}</p>
          </div>
        ))}
        {enquiries.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink-900/40">Inbox is empty.</p>}
      </div>

      {showAdd && (
        <Modal title="Log enquiry" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd}>
            <Field label="Caller name">
              <input name="caller_name" required className={inputClass} placeholder="Jane Doe" />
            </Field>
            <Field label="Source">
              <select name="source" className={inputClass} defaultValue="phone">
                <option value="phone">Phone</option>
                <option value="web">Web</option>
                <option value="walk_in">Walk-in</option>
              </select>
            </Field>
            <Field label="Status">
              <select name="status" className={inputClass} defaultValue="open">
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="missed">Missed</option>
              </select>
            </Field>
            <Field label="Notes">
              <textarea name="notes" rows={3} className={inputClass} placeholder="What did they need?" />
            </Field>
            <SubmitButton disabled={saving}>{saving ? 'Saving…' : 'Log enquiry'}</SubmitButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
