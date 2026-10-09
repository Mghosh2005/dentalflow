import { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  Phone, Mail, Plus, Trash2, Pencil, User, MapPin, AlertTriangle,
  Calendar, ShieldAlert, HeartHandshake, Eye, Search, ChevronRight, X
} from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = () => api.getPatients().then((data) => {
    setPatients(data || []);
    // Update selected patient if open
    if (selectedPatient) {
      const updated = data.find((p) => p.id === selectedPatient.id);
      if (updated) setSelectedPatient(updated);
    }
  });

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.target);
    const firstName = form.get('first_name')?.trim();
    const lastName = form.get('last_name')?.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    await api.createPatient({
      name: fullName,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: form.get('date_of_birth'),
      gender: form.get('gender'),
      phone: form.get('phone'),
      email: form.get('email'),
      address: form.get('address'),
      medical_notes: form.get('medical_notes'),
      emergency_contact: form.get('emergency_contact'),
    });
    setSaving(false);
    setShowAdd(false);
    load();
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.target);
    const firstName = form.get('first_name')?.trim();
    const lastName = form.get('last_name')?.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    await api.updatePatient(editing.id, {
      name: fullName,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: form.get('date_of_birth'),
      gender: form.get('gender'),
      phone: form.get('phone'),
      email: form.get('email'),
      address: form.get('address'),
      medical_notes: form.get('medical_notes'),
      emergency_contact: form.get('emergency_contact'),
      status: form.get('status'),
    });
    setSaving(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to remove this patient record?')) return;
    await api.deletePatient(id);
    if (selectedPatient?.id === id) setSelectedPatient(null);
    load();
  };

  // Filter patients by name or contact
  const filteredPatients = patients.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
            Patients
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {patients.length} registered patients with complete clinical and emergency profiles.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="shrink-0 flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20 active:scale-95"
        >
          <Plus size={16} /> Add Patient
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients by name, phone, or email..."
            className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 text-slate-800 font-medium"
          />
        </div>
      </div>

      {/* Main Table + Profile View Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Table of Patients (takes 2 cols if patient selected, or 3 cols) */}
        <div className={`${selectedPatient ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70 border-b border-slate-200">
                  <th className="px-5 py-3.5">Patient Name</th>
                  <th className="px-5 py-3.5">Contact</th>
                  <th className="px-5 py-3.5">DOB / Gender</th>
                  <th className="px-5 py-3.5">Medical Alert</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredPatients.map((p) => {
                  const isSelected = selectedPatient?.id === p.id;
                  const hasAlert = p.medical_notes && p.medical_notes.length > 0;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPatient(p)}
                      className={`hover:bg-teal-50/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-teal-50/80 font-bold' : ''
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center shrink-0">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 leading-tight">{p.name}</p>
                            <p className="text-[11px] text-slate-400 font-normal">
                              Last visit: {p.last_visit_date ? new Date(p.last_visit_date).toLocaleDateString() : 'New'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600">
                        <p className="flex items-center gap-1.5"><Phone size={12} className="text-slate-400" /> {p.phone || '—'}</p>
                        <p className="flex items-center gap-1.5 text-slate-400 mt-0.5"><Mail size={12} /> {p.email || '—'}</p>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-600">
                        <p>{p.date_of_birth || '—'}</p>
                        <p className="text-[11px] text-slate-400">{p.gender || '—'}</p>
                      </td>

                      <td className="px-5 py-4">
                        {hasAlert ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                            <AlertTriangle size={11} /> Alert
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Nil</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold capitalize bg-teal-100 text-teal-800">
                          {p.status || 'active'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedPatient(p)}
                            title="View Full Profile"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-slate-100 transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => setEditing(p)}
                            title="Edit Patient"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            title="Delete Patient"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-xs">
                      No patients found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Patient Expanded Profile View (Displays all 9 fields per PDF requirement) */}
        {selectedPatient && (
          <div className="bg-white rounded-3xl border border-teal-200 p-6 shadow-md relative animate-fadeIn lg:sticky lg:top-24">
            <button
              onClick={() => setSelectedPatient(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white font-bold text-base flex items-center justify-center shrink-0 shadow-sm">
                {selectedPatient.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900 leading-tight">
                  {selectedPatient.name}
                </h3>
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-100 text-teal-800 mt-1">
                  {selectedPatient.status || 'Active Patient'}
                </span>
              </div>
            </div>

            {/* Profile Fields */}
            <div className="mt-5 space-y-4 text-xs">
              {/* DOB and Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date of Birth</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.date_of_birth || 'Not specified'}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gender</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.gender || 'Not specified'}</p>
                </div>
              </div>

              {/* Contact Information */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Contact Details</p>
                <div className="flex items-center gap-2 text-slate-800">
                  <Phone size={14} className="text-teal-600" />
                  <span className="font-semibold">{selectedPatient.phone || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800">
                  <Mail size={14} className="text-teal-600" />
                  <span className="font-semibold">{selectedPatient.email || 'No email'}</span>
                </div>
                <div className="flex items-start gap-2 text-slate-800 pt-1">
                  <MapPin size={14} className="text-teal-600 shrink-0 mt-0.5" />
                  <span className="font-medium">{selectedPatient.address || 'Address not registered'}</span>
                </div>
              </div>

              {/* Emergency Contact Number */}
              <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/60 text-rose-900">
                <div className="flex items-center gap-1.5 mb-1 text-rose-700 font-bold">
                  <ShieldAlert size={14} />
                  <span className="text-[10px] uppercase tracking-wider">Emergency Contact</span>
                </div>
                <p className="font-bold text-sm">
                  {selectedPatient.emergency_contact || 'None specified'}
                </p>
              </div>

              {/* Medical Notes / Allergies */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-amber-950">
                <div className="flex items-center gap-1.5 mb-1.5 text-amber-800 font-bold">
                  <AlertTriangle size={14} />
                  <span className="text-[10px] uppercase tracking-wider">Medical Notes & Allergies</span>
                </div>
                <p className="font-medium text-xs leading-relaxed text-amber-900">
                  {selectedPatient.medical_notes || 'No medical conditions or allergies recorded.'}
                </p>
              </div>

              {/* Edit button */}
              <button
                onClick={() => setEditing(selectedPatient)}
                className="w-full mt-2 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
              >
                <Pencil size={14} />
                Edit Complete Patient Profile
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ADD PATIENT MODAL — With all 9 fields per PDF */}
      {showAdd && (
        <Modal title="Add New Patient" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name">
                <input name="first_name" required className={inputClass} placeholder="Christopher" />
              </Field>
              <Field label="Last Name">
                <input name="last_name" required className={inputClass} placeholder="White" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date of Birth">
                <input name="date_of_birth" type="date" className={inputClass} />
              </Field>
              <Field label="Gender">
                <select name="gender" className={inputClass}>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input name="phone" type="tel" required className={inputClass} placeholder="555-0101" />
              </Field>
              <Field label="Email">
                <input name="email" type="email" required className={inputClass} placeholder="c.white@example.com" />
              </Field>
            </div>

            <Field label="Residential Address">
              <input name="address" className={inputClass} placeholder="742 Evergreen Terrace, Downtown" />
            </Field>

            <Field label="Emergency Contact Number">
              <input name="emergency_contact" className={inputClass} placeholder="555-0191 (Sarah White - Spouse)" />
            </Field>

            <Field label="Medical Notes (Allergies, Conditions, Precautions)">
              <textarea
                name="medical_notes"
                rows={3}
                className={inputClass}
                placeholder="Penicillin allergy, latex sensitivity, dental anxiety..."
              />
            </Field>

            <SubmitButton disabled={saving}>
              {saving ? 'Saving...' : 'Register Patient'}
            </SubmitButton>
          </form>
        </Modal>
      )}

      {/* EDIT PATIENT MODAL — With all 9 fields per PDF */}
      {editing && (
        <Modal title={`Edit Patient: ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name">
                <input
                  name="first_name"
                  defaultValue={editing.first_name || editing.name.split(' ')[0]}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Last Name">
                <input
                  name="last_name"
                  defaultValue={editing.last_name || editing.name.split(' ').slice(1).join(' ')}
                  required
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date of Birth">
                <input
                  name="date_of_birth"
                  type="date"
                  defaultValue={editing.date_of_birth || ''}
                  className={inputClass}
                />
              </Field>
              <Field label="Gender">
                <select name="gender" defaultValue={editing.gender || ''} className={inputClass}>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input
                  name="phone"
                  type="tel"
                  defaultValue={editing.phone || ''}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  defaultValue={editing.email || ''}
                  required
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Residential Address">
              <input
                name="address"
                defaultValue={editing.address || ''}
                className={inputClass}
              />
            </Field>

            <Field label="Emergency Contact Number">
              <input
                name="emergency_contact"
                defaultValue={editing.emergency_contact || ''}
                className={inputClass}
              />
            </Field>

            <Field label="Medical Notes (Allergies, Conditions, Precautions)">
              <textarea
                name="medical_notes"
                rows={3}
                defaultValue={editing.medical_notes || ''}
                className={inputClass}
              />
            </Field>

            <Field label="Status">
              <select name="status" defaultValue={editing.status || 'active'} className={inputClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>

            <SubmitButton disabled={saving}>
              {saving ? 'Updating...' : 'Save Patient Profile'}
            </SubmitButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
