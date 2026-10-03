import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Plus, MessageSquare } from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';
import VoiceAgentSimulator from '../components/VoiceAgentSimulator';

const statusStyles = {
  open: 'bg-ink-900/[0.06] text-ink-900/60',
  resolved: 'bg-teal-100 text-teal-600',
  missed: 'bg-clay-100 text-clay-600',
  escalated: 'bg-clay-100 text-clay-600',
  action_required: 'bg-teal-100 text-teal-600',
};

const intentStyles = {
  appointment_booking: 'bg-teal-100 text-teal-600 border-teal-200',
  clinical_emergency: 'bg-clay-100 text-clay-600 border-clay-200',
  patient_complaint: 'bg-clay-100 text-clay-600 border-clay-200',
  pricing_inquiry: 'bg-ink-900/[0.06] text-ink-900/60 border-black/5',
  general_inquiry: 'bg-ink-900/[0.06] text-ink-900/60 border-black/5',
};

export default function Inbox() {
  const [activeTab, setActiveTab] = useState('call_logs');
  const [filter, setFilter] = useState('all');
  
  const [enquiries, setEnquiries] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [selectedTranscript, setSelectedTranscript] = useState(null);

  const loadEnquiries = () => api.getEnquiries().then(setEnquiries);
  const loadCallLogs = () => api.getCallLogs().then(setCallLogs);
  
  useEffect(() => {
    loadEnquiries();
    loadCallLogs();
  }, []);

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
    loadEnquiries();
  };

  const updateEnquiryStatus = async (id, status) => {
    await api.updateEnquiry(id, { status });
    loadEnquiries();
  };

  const updateCallLogStatus = async (id, status) => {
    await api.updateCallLog(id, { status });
    loadCallLogs();
  };

  const filteredLogs = callLogs.filter(log => {
    if (filter === 'all') return true;
    if (filter === 'after_hours') return log.is_after_hours;
    if (filter === 'won_back') return log.is_won_back;
    if (filter === 'escalations') return ['clinical_emergency', 'patient_complaint'].includes(log.intent);
    if (filter === 'booking') return log.intent === 'appointment_booking';
    return true;
  });
  
  const totalAiCalls = callLogs.length;
  const wonBackCalls = callLogs.filter(l => l.is_won_back).length;
  const escalatedCalls = callLogs.filter(l => ['clinical_emergency', 'patient_complaint'].includes(l.intent)).length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Inbox</h1>
          <p className="text-ink-900/50 text-sm">Enquiries from calls and the web, in one place.</p>
        </div>
        {activeTab === 'enquiries' && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-ink-900 text-white hover:bg-ink-800 transition-colors"
          >
            <Plus size={15} /> Log enquiry
          </button>
        )}
      </div>

      <div className="flex border-b border-slate-200 mb-6 space-x-6">
        <button 
          onClick={() => setActiveTab('call_logs')}
          className={`pb-3 text-sm font-medium ${activeTab === 'call_logs' ? 'text-ink-900 border-b-2 border-ink-900' : 'text-ink-900/40 hover:text-ink-900/70'}`}
        >
          AI Call Log
        </button>
        <button 
          onClick={() => setActiveTab('enquiries')}
          className={`pb-3 text-sm font-medium ${activeTab === 'enquiries' ? 'text-ink-900 border-b-2 border-ink-900' : 'text-ink-900/40 hover:text-ink-900/70'}`}
        >
          Enquiries (Legacy)
        </button>
      </div>

      {activeTab === 'call_logs' && (
        <>
          <div className="flex gap-4 mb-6">
            <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-xs text-ink-900/50 mb-1">Total AI Calls</p>
              <p className="text-xl font-semibold text-ink-900">{totalAiCalls}</p>
            </div>
            <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-xs text-ink-900/50 mb-1">Won-Back Calls</p>
              <p className="text-xl font-semibold text-ink-900">{wonBackCalls}</p>
            </div>
            <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-xs text-ink-900/50 mb-1">Escalated Calls</p>
              <p className="text-xl font-semibold text-ink-900">{escalatedCalls}</p>
            </div>
          </div>
          
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'after_hours', label: 'After Hours' },
              { id: 'won_back', label: 'Won Back' },
              { id: 'escalations', label: 'Escalations' },
              { id: 'booking', label: 'Booking' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filter === f.id ? 'bg-ink-900 text-white' : 'bg-white border border-slate-200 text-ink-900/60 hover:bg-slate-50'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-black/5">
            {filteredLogs.map(log => (
              <div key={log.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-semibold text-ink-900">{log.caller_name || 'Unknown Caller'}</span>
                      {log.caller_name_spelled && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded tracking-widest uppercase">
                          {log.caller_name_spelled}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-ink-900/60 flex items-center gap-2">
                      {log.caller_phone} {log.caller_email && <span>· {log.caller_email}</span>}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <select
                      value={log.status}
                      onChange={(ev) => updateCallLogStatus(log.id, ev.target.value)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize border-0 focus:outline-none focus:ring-2 focus:ring-teal-500/30 ${statusStyles[log.status] || statusStyles.open}`}
                    >
                      <option value="open">Open</option>
                      <option value="resolved">Resolved</option>
                      <option value="escalated">Escalated</option>
                      <option value="action_required">Action Required</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${intentStyles[log.intent] || intentStyles.general_inquiry}`}>
                    {(log.intent || '').replaceAll('_', ' ').toUpperCase()}
                  </span>
                  {log.is_after_hours ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-black/10 bg-ink-900/5 text-ink-900/60">
                      AFTER HOURS
                    </span>
                  ) : null}
                  {log.is_won_back ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-teal-200 bg-teal-50 text-teal-600">
                      WON BACK
                    </span>
                  ) : null}
                </div>
                
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm text-ink-900/70 mb-3">
                  {log.ai_summary}
                </div>
                
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-ink-900/40">
                    {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                  
                  {log.transcript && (
                    <button 
                      onClick={() => setSelectedTranscript(log.transcript)}
                      className="text-xs font-medium text-ink-900/60 hover:text-ink-900 flex items-center gap-1.5"
                    >
                      <MessageSquare size={13} /> View Transcript
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filteredLogs.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-ink-900/40">No call logs found.</p>
            )}
          </div>
        </>
      )}

      {activeTab === 'enquiries' && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-black/5">
          {enquiries.map((e) => (
            <div key={e.id} className="px-5 py-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-ink-900">{e.caller_name || 'Unknown caller'}</p>
                <select
                  value={e.status}
                  onChange={(ev) => updateEnquiryStatus(e.id, ev.target.value)}
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
      )}

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
      
      {selectedTranscript && (
        <Modal title="Call Transcript" onClose={() => setSelectedTranscript(null)}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
            {(() => {
              try {
                const parsed = typeof selectedTranscript === 'string' ? JSON.parse(selectedTranscript) : selectedTranscript;
                if (!Array.isArray(parsed)) return <p className="text-sm text-ink-900/50">Invalid transcript format.</p>;
                return parsed.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'ai' || msg.role === 'assistant' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'ai' || msg.role === 'assistant' 
                        ? 'bg-teal-600 text-white rounded-br-sm' 
                        : 'bg-slate-100 text-ink-900 rounded-bl-sm'
                    }`}>
                      <p className="text-xs opacity-70 mb-1 font-medium">{msg.role === 'ai' || msg.role === 'assistant' ? 'AI Voice Receptionist' : 'Caller'}</p>
                      {msg.text}
                    </div>
                  </div>
                ));
              } catch (err) {
                return <p className="text-sm text-ink-900/50">Could not parse transcript.</p>;
              }
            })()}
          </div>
        </Modal>
      )}

      {/* Floating Voice Agent Simulator Action Widget */}
      <VoiceAgentSimulator mode="floating" onCallEnded={loadCallLogs} />
    </div>
  );
}

