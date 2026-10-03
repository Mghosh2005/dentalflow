import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AlertTriangle, Siren, MessageSquareWarning, Phone, MessageSquare } from 'lucide-react';
import Modal from '../components/Modal';

const severityStyles = {
  critical: 'border-clay-600/30 bg-clay-100',
  high: 'border-ink-900/15 bg-slate-50',
  medium: 'border-slate-200 bg-white',
};

const severityBadge = {
  critical: 'bg-clay-600 text-white',
  high: 'bg-ink-900 text-white',
  medium: 'bg-ink-900/10 text-ink-900',
};

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedTranscript, setSelectedTranscript] = useState(null);

  const loadAlerts = () => api.getAlerts().then(setAlerts);
  const loadCallLogs = () => api.getCallLogs().then(setCallLogs);
  
  useEffect(() => {
    loadAlerts();
    loadCallLogs();
  }, []);

  const dismiss = async (id) => {
    await api.dismissAlert(id);
    loadAlerts();
  };

  const getLogForAlert = (alert) => {
    if (!alert.call_log_id) return null;
    return callLogs.find(l => l.id === alert.call_log_id);
  };

  const filteredAlerts = alerts.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'escalations') return !!a.escalation_type;
    if (filter === 'system') return !a.escalation_type;
    return true;
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Alerts</h1>
      <p className="text-ink-900/50 text-sm mb-4">Active alerts requiring your attention.</p>

      <div className="flex gap-2 mb-6">
        {[
          { id: 'all', label: 'All Alerts' },
          { id: 'escalations', label: 'AI Escalations' },
          { id: 'system', label: 'System Alerts' }
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

      <div className="space-y-3">
        {filteredAlerts.map((a) => {
          const isEscalation = !!a.escalation_type;
          const callLog = getLogForAlert(a);
          
          let Icon = AlertTriangle;
          let iconColor = 'text-ink-900/60';
          if (a.escalation_type === 'clinical_emergency') {
            Icon = Siren;
            iconColor = 'text-clay-600';
          } else if (a.escalation_type === 'patient_complaint') {
            Icon = MessageSquareWarning;
            iconColor = 'text-clay-600';
          }

          return (
            <div key={a.id} className={`rounded-xl border px-5 py-4 flex items-start gap-4 ${severityStyles[a.severity] || severityStyles.medium}`}>
              <Icon size={18} className={`mt-0.5 shrink-0 ${iconColor}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-ink-900">{a.title}</p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${severityBadge[a.severity] || severityBadge.medium}`}>{a.severity}</span>
                </div>
                <p className="text-sm text-ink-900/60 mb-2">{a.message}</p>
                
                {isEscalation && callLog && (
                  <div className="mt-2 pt-2 border-t border-black/5 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-ink-900/70">
                      <strong>{callLog.caller_name || 'Unknown'}</strong>
                      {(callLog.caller_phone || callLog.caller_email) && (
                        <span> · {callLog.caller_phone} {callLog.caller_email}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {callLog.caller_phone && (
                        <a 
                          href={`tel:${callLog.caller_phone}`}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                        >
                          <Phone size={13} /> Call Back
                        </a>
                      )}
                      {callLog.transcript && (
                        <button 
                          onClick={() => setSelectedTranscript(callLog.transcript)}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-ink-900/70 hover:bg-slate-50"
                        >
                          <MessageSquare size={13} /> View Transcript
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => dismiss(a.id)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-black/10 text-ink-900/60 hover:bg-black/5 shrink-0"
              >
                Dismiss
              </button>
            </div>
          );
        })}
        {filteredAlerts.length === 0 && <p className="text-sm text-ink-900/40 py-8 text-center">No active alerts.</p>}
      </div>

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
    </div>
  );
}
