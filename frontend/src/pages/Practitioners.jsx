import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Stethoscope, Plus, Phone, Mail, Clock, Calendar, CheckCircle2, UserPlus } from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

const SPECIALTIES = [
  'General Dentistry',
  'Orthodontics',
  'Dental Hygienist',
  'Pediatric Dentistry',
  'Periodontics',
  'Endodontics',
  'Prosthodontics',
  'Oral & Maxillofacial Surgery'
];

export default function Practitioners() {
  const [list, setList] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api.getPractitioners().then((data) => setList(data || []));

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.target);
    await api.createPractitioner({
      name: form.get('name')?.trim(),
      title: form.get('title')?.trim(),
      specialty: form.get('specialty'),
      phone: form.get('phone')?.trim(),
      email: form.get('email')?.trim(),
    });
    setSaving(false);
    setShowAdd(false);
    load();
  };

  return (
    <div className="max-w-5xl space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
            Practitioners
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Clinical team members, dental specialists, and practice hygienists.
          </p>
        </div>

        {/* “Add Practitioner” Button directly per PDF section 8 */}
        <button
          onClick={() => setShowAdd(true)}
          className="shrink-0 flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20 active:scale-95"
        >
          <UserPlus size={16} />
          <span>Add Practitioner</span>
        </button>
      </div>

      {/* Practitioner Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {list.map((p) => (
          <div
            key={p.id}
            className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md hover:border-teal-300 transition-all flex flex-col justify-between"
          >
            <div>
              {/* Header Icon + Specialty Badge */}
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-base shadow-xs">
                  <Stethoscope size={22} />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800">
                  {p.specialty || 'General Dentistry'}
                </span>
              </div>

              {/* Name & Title */}
              <h3 className="font-display font-bold text-lg text-slate-900">
                {p.name}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {p.title || 'Clinical Practitioner'}
              </p>

              {/* Contact Information */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                {p.phone && (
                  <p className="flex items-center gap-2">
                    <Phone size={13} className="text-slate-400" />
                    <span>{p.phone}</span>
                  </p>
                )}
                {p.email && (
                  <p className="flex items-center gap-2">
                    <Mail size={13} className="text-slate-400" />
                    <span>{p.email}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Operating Schedule */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold bg-slate-50 -mx-6 -mb-6 p-4 rounded-b-3xl">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-teal-600" /> Mon–Fri: 08:00 – 18:00
              </span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 size={12} /> Active
              </span>
            </div>
          </div>
        ))}
      </div>

      {list.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <Stethoscope size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">No practitioners on record</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold"
          >
            Add Your First Practitioner
          </button>
        </div>
      )}

      {/* Add Practitioner Modal */}
      {showAdd && (
        <Modal title="Add Clinical Practitioner" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <Field label="Full Name">
              <input
                name="name"
                required
                className={inputClass}
                placeholder="Dr. Jordan Hayes"
              />
            </Field>

            <Field label="Title / Credentials">
              <input
                name="title"
                className={inputClass}
                placeholder="DMD, Periodontist Specialist"
              />
            </Field>

            <Field label="Specialty">
              <select name="specialty" required className={inputClass}>
                {SPECIALTIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input
                  name="phone"
                  type="tel"
                  className={inputClass}
                  placeholder="555-0205"
                />
              </Field>
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  className={inputClass}
                  placeholder="j.hayes@dentalflow.com"
                />
              </Field>
            </div>

            <SubmitButton disabled={saving}>
              {saving ? 'Adding...' : 'Add Practitioner'}
            </SubmitButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
