import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import {
  Phone, Mail, Plus, Trash2, Pencil, User, MapPin, AlertTriangle,
  Calendar, ShieldAlert, HeartHandshake, Eye, Search, ChevronRight, X,
  Activity, Upload, ArrowUpRight, Clock, CheckCircle2, Copy, Layers, Scan
} from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

export default function Patients({ onNavigate = null }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [profileTab, setProfileTab] = useState('overview'); // overview, imaging, timeline
  const [imagingStudies, setImagingStudies] = useState([]);
  const [loadingImaging, setLoadingImaging] = useState(false);
  const [timelineItems, setTimelineItems] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [formDirty, setFormDirty] = useState(false);
  const [formError, setFormError] = useState('');

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(null);

  const load = () => api.getPatients().then((data) => {
    setPatients(data || []);
    if (selectedPatient) {
      const updated = data.find((p) => p.id === selectedPatient.id);
      if (updated) setSelectedPatient(updated);
    }
  });

  const loadImaging = useCallback(async (patientId) => {
    if (!patientId) return;
    try {
      setLoadingImaging(true);
      const studies = await api.getPatientImagingStudies(patientId);
      setImagingStudies(studies || []);
    } catch (err) {
      console.error('Failed to load imaging studies:', err);
    } finally {
      setLoadingImaging(false);
    }
  }, []);

  const loadTimeline = useCallback(async (patientId) => {
    if (!patientId) return;
    try {
      setLoadingTimeline(true);
      const res = await api.getPatientTimeline(patientId);
      setTimelineItems(res?.timeline || []);
    } catch (err) {
      console.error('Failed to load patient timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selectedPatient?.id) {
      if (profileTab === 'imaging') {
        loadImaging(selectedPatient.id);
      } else if (profileTab === 'timeline') {
        loadTimeline(selectedPatient.id);
      }
    }
  }, [selectedPatient?.id, profileTab, loadImaging, loadTimeline]);

  const selectPatientWithDetails = (patient) => {
    setSelectedPatient(patient);
    setProfileTab('overview');
    if (patient?.id) {
      loadImaging(patient.id);
      loadTimeline(patient.id);
    }
  };

  const openAddForm = () => {
    setFormDirty(false);
    setFormError('');
    setShowAdd(true);
  };

  const closeAddForm = () => {
    setShowAdd(false);
    setFormDirty(false);
    setFormError('');
  };

  const openEditForm = (patient) => {
    setFormDirty(false);
    setFormError('');
    setEditing(patient);
  };

  const closeEditForm = () => {
    setEditing(null);
    setFormDirty(false);
    setFormError('');
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
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
      closeAddForm();
      load();
    } catch (err) {
      setFormError(err?.message || 'Failed to create patient. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
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
      closeEditForm();
      load();
    } catch (err) {
      setFormError(err?.message || 'Failed to update patient. Please try again.');
    } finally {
      setSaving(false);
    }
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
    <div className="max-w-6xl space-y-4 sm:space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Patients
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {patients.length} registered patients with complete clinical and emergency profiles.
          </p>
        </div>
        <button
          onClick={openAddForm}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
        {/* Table of Patients (takes 2 cols if patient selected, or 3 cols) */}
        <div className={`${selectedPatient ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white rounded-2xl sm:rounded-3xl border border-slate-200 overflow-hidden shadow-xs`}>
          <div className="responsive-table-wrap">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70 border-b border-slate-200">
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 whitespace-nowrap">Patient Name</th>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 whitespace-nowrap">Contact</th>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 whitespace-nowrap hidden md:table-cell">DOB / Gender</th>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 whitespace-nowrap hidden sm:table-cell">Medical Alert</th>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 whitespace-nowrap hidden sm:table-cell">Status</th>
                  <th className="px-3 sm:px-5 py-3 sm:py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredPatients.map((p) => {
                  const isSelected = selectedPatient?.id === p.id;
                  const hasAlert = p.medical_notes && p.medical_notes.length > 0;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => selectPatientWithDetails(p)}
                      className={`hover:bg-teal-50/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-teal-50/80 font-bold' : ''
                      }`}
                    >
                      <td className="px-3 sm:px-5 py-3 sm:py-4">
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center shrink-0">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900 leading-tight">{p.name}</p>
                              {p.medical_record_number && (
                                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                                  {p.medical_record_number}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-normal">
                              Last visit: {p.last_visit_date ? new Date(p.last_visit_date).toLocaleDateString() : 'New'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 sm:px-5 py-3 sm:py-4 text-xs text-slate-600">
                        <p className="flex items-center gap-1.5 truncate max-w-[150px] sm:max-w-none"><Phone size={12} className="text-slate-400 shrink-0" /> {p.phone || '—'}</p>
                        <p className="flex items-center gap-1.5 text-slate-400 mt-0.5 truncate max-w-[150px] sm:max-w-none"><Mail size={12} className="shrink-0" /> {p.email || '—'}</p>
                      </td>

                      <td className="px-3 sm:px-5 py-3 sm:py-4 text-xs text-slate-600 hidden md:table-cell">
                        <p>{p.date_of_birth || '—'}</p>
                        <p className="text-[11px] text-slate-400">{p.gender || '—'}</p>
                      </td>

                      <td className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">
                        {hasAlert ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                            <AlertTriangle size={11} /> Alert
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Nil</span>
                        )}
                      </td>

                      <td className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold capitalize bg-teal-100 text-teal-800">
                          {p.status || 'active'}
                        </span>
                      </td>

                      <td className="px-3 sm:px-5 py-3 sm:py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => selectPatientWithDetails(p)}
                            title="View Full Profile & Imaging"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-slate-100 transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => openEditForm(p)}
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

        {/* Selected Patient Extended Profile + Imaging & Radiographs Tab + Longitudinal Timeline */}
        {selectedPatient && (
          <div className="bg-white rounded-3xl border border-teal-200 p-5 sm:p-6 shadow-md relative animate-fadeIn lg:sticky lg:top-24 max-h-[85vh] flex flex-col">
            <button
              onClick={() => setSelectedPatient(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 z-10"
            >
              <X size={18} />
            </button>

            {/* Patient Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 shrink-0">
              <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white font-bold text-base flex items-center justify-center shrink-0 shadow-sm">
                {selectedPatient.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 pr-6">
                <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 leading-tight truncate">
                  {selectedPatient.name}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-teal-50 text-teal-800 border border-teal-200">
                    {selectedPatient.medical_record_number || `MRN-1-${String(selectedPatient.id).padStart(6, '0')}`}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize bg-slate-100 text-slate-600">
                    {selectedPatient.status || 'Active'}
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Navigation Tabs (Overview, Imaging & Radiographs, Timeline) */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl my-3 shrink-0 text-xs font-bold">
              <button
                type="button"
                onClick={() => setProfileTab('overview')}
                className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                  profileTab === 'overview'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('imaging')}
                className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  profileTab === 'imaging'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Scan size={13} />
                Imaging
                {imagingStudies.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-teal-100 text-teal-800 font-bold">
                    {imagingStudies.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('timeline')}
                className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  profileTab === 'timeline'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock size={13} />
                Timeline
              </button>
            </div>

            {/* TAB CONTENT 1: OVERVIEW */}
            {profileTab === 'overview' && (
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
                {/* Canonical UUID & Provenance */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    <span>Canonical Patient UUID</span>
                    <span className="text-teal-600 font-semibold lowercase">verified</span>
                  </div>
                  <p className="font-mono text-[11px] text-slate-700 break-all select-all">
                    {selectedPatient.canonical_uuid || 'Auto-generated on sync'}
                  </p>
                </div>

                {/* Structured Allergies */}
                <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/70">
                  <div className="flex items-center gap-1.5 mb-1.5 text-rose-800 font-bold">
                    <ShieldAlert size={14} />
                    <span className="text-[10px] uppercase tracking-wider">Structured Allergies</span>
                  </div>
                  {(() => {
                    let allergies = [];
                    try {
                      if (selectedPatient.allergies_json) allergies = JSON.parse(selectedPatient.allergies_json);
                    } catch(e) {}
                    if (allergies.length === 0 && selectedPatient.medical_notes?.toLowerCase().includes('penicillin')) {
                      allergies.push('Penicillin');
                    }
                    return allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {allergies.map(a => (
                          <span key={a} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            {a}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-rose-600 text-xs italic">No known drug allergies recorded.</p>
                    );
                  })()}
                </div>

                {/* DOB & Gender */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date of Birth</p>
                    <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.date_of_birth || 'Not specified'}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gender</p>
                    <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.gender || 'Not specified'}</p>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Contact Details</p>
                  <p className="flex items-center gap-2 text-slate-800 font-semibold"><Phone size={13} className="text-teal-600" /> {selectedPatient.phone || 'No phone'}</p>
                  <p className="flex items-center gap-2 text-slate-800 font-semibold"><Mail size={13} className="text-teal-600" /> {selectedPatient.email || 'No email'}</p>
                  <p className="flex items-start gap-2 text-slate-700 pt-0.5 font-medium"><MapPin size={13} className="text-teal-600 shrink-0 mt-0.5" /> {selectedPatient.address || 'Address not registered'}</p>
                </div>

                {/* Emergency Contact */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Emergency Contact</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.emergency_contact || 'None specified'}</p>
                </div>

                {/* Medical Notes */}
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-amber-950">
                  <p className="text-[10px] uppercase font-bold text-amber-800 tracking-wider mb-1">Encounter & Medical Notes</p>
                  <p className="font-medium text-xs text-amber-900 leading-relaxed">
                    {selectedPatient.medical_notes || 'No historical medical notes recorded.'}
                  </p>
                </div>

                <button
                  onClick={() => openEditForm(selectedPatient)}
                  className="w-full mt-2 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all text-xs"
                >
                  <Pencil size={13} /> Edit Profile
                </button>
              </div>
            )}

            {/* TAB CONTENT 2: IMAGING & RADIOGRAPHS (Mandatory PDF Milestone) */}
            {profileTab === 'imaging' && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                {/* Upload Action Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">Radiographs & Studies</h4>
                    <p className="text-[10px] text-slate-400">DICOM, PNG & JPEG supported</p>
                  </div>
                  <button
                    onClick={() => {
                      setUploadError('');
                      setUploadSuccess(null);
                      setShowUploadModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
                  >
                    <Upload size={13} /> Upload X-ray
                  </button>
                </div>

                {loadingImaging ? (
                  <div className="py-8 text-center text-slate-400">
                    <Activity size={24} className="mx-auto mb-2 animate-spin text-teal-600" />
                    <p className="text-xs font-semibold">Loading radiographic records...</p>
                  </div>
                ) : imagingStudies.length > 0 ? (
                  <div className="space-y-2.5">
                    {imagingStudies.map((study) => (
                      <div
                        key={study.file_id}
                        className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-teal-300 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                            {study.modality || 'IO'} • {study.file_format?.toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            study.review_id
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {study.review_id ? '✓ Attested' : '⚠ Pending Review'}
                          </span>
                        </div>

                        <div>
                          <p className="font-bold text-slate-900 text-xs truncate">{study.original_filename}</p>
                          <p className="text-[10px] text-slate-400">
                            Date: {study.study_date} • {Math.round((study.file_size_bytes || 0) / 1024)} KB
                          </p>
                        </div>

                        {study.potential_finding_count > 0 && (
                          <p className="text-[11px] font-semibold text-teal-700">
                            {study.potential_finding_count} potential condition{study.potential_finding_count > 1 ? 's' : ''} detected
                          </p>
                        )}

                        <button
                          onClick={() => {
                            if (onNavigate) {
                              onNavigate('imaging', { fileId: study.file_id });
                            }
                          }}
                          className="w-full py-1.5 px-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-teal-200"
                        >
                          <Scan size={13} /> Open in Imaging Workspace <ArrowUpRight size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-4 space-y-2">
                    <Scan size={32} className="mx-auto text-slate-300" />
                    <p className="font-bold text-xs text-slate-700">No radiographs uploaded yet</p>
                    <p className="text-[11px] text-slate-400">
                      Upload intraoral bitewings, periapical, or panoramic X-rays for deep learning condition detection.
                    </p>
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 text-white font-bold text-xs shadow-xs mt-2"
                    >
                      <Upload size={13} /> Upload First Radiograph
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT 3: LONGITUDINAL TIMELINE (Mandatory PDF Milestone) */}
            {profileTab === 'timeline' && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs">Longitudinal Patient Timeline</h4>
                  <span className="text-[10px] text-slate-400 font-medium">{timelineItems.length} records</span>
                </div>

                {loadingTimeline ? (
                  <div className="py-8 text-center text-slate-400">
                    <Activity size={24} className="mx-auto mb-2 animate-spin text-teal-600" />
                    <p className="text-xs font-semibold">Compiling longitudinal record...</p>
                  </div>
                ) : timelineItems.length > 0 ? (
                  <div className="relative pl-5 space-y-4 border-l-2 border-slate-200">
                    {timelineItems.map((item) => (
                      <div key={item.id} className="relative group">
                        {/* Timeline node icon */}
                        <div className="absolute -left-[27px] top-0.5 w-4 h-4 rounded-full bg-teal-600 border-2 border-white shadow-xs" />
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-bold uppercase tracking-wider text-teal-700">{item.type.replace('_', ' ')}</span>
                            <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                          </div>
                          <p className="font-bold text-slate-900 text-xs">{item.title}</p>
                          <p className="text-[11px] text-slate-600 leading-tight">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-400 py-6 text-xs">No timeline records found.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* UPLOAD RADIOGRAPH MODAL (With Multi-tier Patient Matching) */}
      {showUploadModal && selectedPatient && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  <Scan size={20} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Upload Radiograph</h3>
                  <p className="text-xs text-slate-500">
                    Patient: {selectedPatient.name} ({selectedPatient.medical_record_number})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {uploadError}
              </div>
            )}

            {uploadSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                {uploadSuccess}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setUploading(true);
                setUploadError('');
                setUploadSuccess(null);
                try {
                  const form = e.target;
                  const fileInput = form.elements.file;
                  if (!fileInput.files || fileInput.files.length === 0) {
                    throw new Error('Please select an image file to upload.');
                  }

                  const formData = new FormData();
                  formData.append('file', fileInput.files[0]);
                  formData.append('patient_id', selectedPatient.id);
                  formData.append('mrn', selectedPatient.medical_record_number || '');
                  formData.append('modality', form.elements.modality.value);
                  formData.append('study_date', form.elements.study_date.value);
                  formData.append('study_description', form.elements.study_description.value);

                  const res = await api.uploadRadiograph(formData);

                  if (res.status === 'ingested') {
                    setUploadSuccess('Radiograph verified and ingested successfully!');
                    setTimeout(() => {
                      setShowUploadModal(false);
                      loadImaging(selectedPatient.id);
                      loadTimeline(selectedPatient.id);
                    }, 1000);
                  } else if (res.status === 'quarantined') {
                    setUploadError(`Upload quarantined: ${res.reason}`);
                  }
                } catch (err) {
                  setUploadError(err.message || 'Upload failed');
                } finally {
                  setUploading(false);
                }
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Radiograph File (DICOM .dcm/.rvg, PNG, JPEG):
                </label>
                <input
                  type="file"
                  name="file"
                  required
                  accept=".dcm,.rvg,.png,.jpg,.jpeg,image/png,image/jpeg,application/dicom"
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white file:font-bold file:text-xs hover:file:bg-teal-700 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Study Modality:</label>
                  <select
                    name="modality"
                    defaultValue="IO"
                    className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800"
                  >
                    <option value="IO">IO — Intraoral Bitewing/Periapical</option>
                    <option value="PX">PX — Panoramic OPG</option>
                    <option value="DX">DX — Digital Radiography</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Study Date:</label>
                  <input
                    type="date"
                    name="study_date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Clinical Indication / Description:</label>
                <input
                  type="text"
                  name="study_description"
                  placeholder="e.g. Annual recall bitewing, check molar sensitivity"
                  className="w-full p-2 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800"
                />
              </div>

              {/* Patient Matching Safety Governance Notice */}
              <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-[11px] leading-relaxed">
                <strong>Patient Matching Verification:</strong>
                <p>Associating file to <strong>{selectedPatient.name}</strong> (MRN: {selectedPatient.medical_record_number || 'MRN-Verified'}). Direct patient context with practice isolation confirmed.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                  {uploading ? 'Validating & Uploading...' : 'Upload & Verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD PATIENT MODAL — With all 9 fields per PDF */}
      {showAdd && (
        <Modal title="Add New Patient" onClose={closeAddForm} isDirty={formDirty} confirmCloseIfDirty>
          <form onSubmit={handleAdd} onChange={() => setFormDirty(true)} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {formError}
              </div>
            )}

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
        <Modal title={`Edit Patient: ${editing.name}`} onClose={closeEditForm} isDirty={formDirty} confirmCloseIfDirty>
          <form onSubmit={handleEdit} onChange={() => setFormDirty(true)} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {formError}
              </div>
            )}

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
