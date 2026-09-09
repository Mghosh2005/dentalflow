import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Phone, Mail, Plus, Trash2, Pencil } from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.getPatients().then(setPatients);
  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.target);
    await api.createPatient({
      name: form.get('name'),
      phone: form.get('phone'),
      email: form.get('email'),
    });
    setSaving(false);
    setShowAdd(false);
    load();
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.target);
    await api.updatePatient(editing.id, {
      name: form.get('name'),
      phone: form.get('phone'),
      email: form.get('email'),
    });
    setSaving(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this patient record?')) return;
    await api.deletePatient(id);
    load();
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Patients</h1>
          <p className="text-ink-900/50 text-sm">{patients.length} active patients on record.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-ink-900 text-white hover:bg-ink-800 transition-colors"
        >
          <Plus size={15} /> Add patient
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-900/40 border-b border-slate-200">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Contact</th>
              <th className="px-5 py-3 font-medium">Last visit</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {patients.map((p) => (
              <tr key={p.id} className="group">
                <td className="px-5 py-3 font-medium text-ink-900">{p.name}</td>
                <td className="px-5 py-3 text-ink-900/60">
                  <div className="flex items-center gap-3">
                    {p.phone && <span className="flex items-center gap-1"><Phone size={12} />{p.phone}</span>}
                    {p.email && <span className="flex items-center gap-1"><Mail size={12} />{p.email}</span>}
                  </div>
                </td>
                <td className="px-5 py-3 text-ink-900/60">
                  {p.last_visit_date ? new Date(p.last_visit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No visits yet'}
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-100 text-teal-600 capitalize">{p.status}</span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditing(p)} className="text-ink-900/40 hover:text-ink-900"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(p.id)} className="text-ink-900/40 hover:text-clay-600"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {patients.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-ink-900/40">No patients yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Add patient" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd}>
            <Field label="Full name">
              <input name="name" required className={inputClass} placeholder="Jane Doe" />
            </Field>
            <Field label="Phone">
              <input name="phone" className={inputClass} placeholder="555-0100" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className={inputClass} placeholder="jane@example.com" />
            </Field>
            <SubmitButton disabled={saving}>{saving ? 'Saving…' : 'Add patient'}</SubmitButton>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit patient" onClose={() => setEditing(null)}>
          <form onSubmit={handleEdit}>
            <Field label="Full name">
              <input name="name" defaultValue={editing.name} required className={inputClass} />
            </Field>
            <Field label="Phone">
              <input name="phone" defaultValue={editing.phone || ''} className={inputClass} />
            </Field>
            <Field label="Email">
              <input name="email" type="email" defaultValue={editing.email || ''} className={inputClass} />
            </Field>
            <SubmitButton disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</SubmitButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
