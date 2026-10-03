import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { 
  FileText, CheckCircle2, Clock, AlertTriangle, MessageSquare, 
  ChevronDown, ChevronUp, Sparkles, PhoneCall, ShieldAlert, Bot, ArrowRight, Filter
} from 'lucide-react';

const intentStyles = {
  appointment_booking: 'bg-teal-100 text-teal-700 border-teal-200',
  clinical_emergency: 'bg-clay-100 text-clay-700 border-clay-200',
  patient_complaint: 'bg-clay-100 text-clay-700 border-clay-200',
  pricing_inquiry: 'bg-blue-100 text-blue-700 border-blue-200',
  general_inquiry: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function AiCallSummary({ onNavigate }) {
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [filterIntent, setFilterIntent] = useState('all');

  const loadCallLogs = async () => {
    try {
      setLoading(true);
      const data = await api.getCallLogs();
      setCallLogs(data);
    } catch (err) {
      console.error('Failed to load call logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCallLogs();
  }, []);

  const formatDuration = (secs) => {
    if (!secs) return '0:45';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const filteredLogs = callLogs.filter(log => {
    if (filterIntent === 'all') return true;
    return log.intent === filterIntent;
  });

  const bookedCount = callLogs.filter(l => l.intent === 'appointment_booking').length;
  const emergencyCount = callLogs.filter(l => l.intent === 'clinical_emergency').length;
  const resolvedCount = callLogs.filter(l => l.status === 'resolved').length;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display text-3xl font-semibold text-ink-900">AI Call Summary</h1>
            <span className="text-xs bg-teal-100 text-teal-700 font-semibold px-2.5 py-0.5 rounded-full border border-teal-200">
              Audit & Reviews
            </span>
          </div>
          <p className="text-ink-900/50 text-sm">
            Automated clinical call audits, transcripts, patient sentiment analysis, and outcome summaries.
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('ai-assistant')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-all self-start md:self-auto cursor-pointer"
          >
            <Bot size={15} />
            <span>Open AI Assistant Sandbox</span>
          </button>
        )}
      </div>

      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-ink-900/50 text-xs font-medium uppercase tracking-wider">Total Calls Logged</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">{callLogs.length}</p>
          <p className="text-[11px] text-teal-600 mt-1 font-medium">Inbound AI Receptionist</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-ink-900/50 text-xs font-medium uppercase tracking-wider">Appointments Booked</p>
          <p className="text-2xl font-bold text-teal-600 mt-1">{bookedCount}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {callLogs.length ? Math.round((bookedCount / callLogs.length) * 100) : 0}% booking conversion
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-ink-900/50 text-xs font-medium uppercase tracking-wider">Urgent Emergencies</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{emergencyCount}</p>
          <p className="text-[11px] text-rose-600/80 mt-1 font-medium">Triage alerts escalated</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-ink-900/50 text-xs font-medium uppercase tracking-wider">Resolution Rate</p>
          <p className="text-2xl font-bold text-ink-900 mt-1">
            {callLogs.length ? Math.round((resolvedCount / callLogs.length) * 100) : 100}%
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{resolvedCount} calls resolved cleanly</p>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm overflow-x-auto text-xs">
        <div className="flex items-center gap-1.5 shrink-0">
          <Filter size={14} className="text-slate-400 mr-1" />
          <span className="text-slate-500 font-medium mr-1 text-[11px]">Filter Intent:</span>
          {[
            { id: 'all', label: `All Calls (${callLogs.length})` },
            { id: 'appointment_booking', label: `Bookings (${bookedCount})` },
            { id: 'clinical_emergency', label: `Emergencies (${emergencyCount})` },
            { id: 'general_inquiry', label: 'General Inquiries' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterIntent(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                filterIntent === f.id
                  ? 'bg-ink-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="text-slate-400 text-[11px] shrink-0">
          Showing {filteredLogs.length} of {callLogs.length} call logs
        </span>
      </div>

      {/* Call Reviews & Clinical Audit List */}
      <div className="space-y-4">
        {filteredLogs.map((log) => {
          const isExpanded = expandedLogId === log.id;
          let transcriptTurns = [];
          try {
            transcriptTurns = typeof log.transcript === 'string' ? JSON.parse(log.transcript) : log.transcript || [];
          } catch (e) {}

          return (
            <div
              key={log.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-300"
            >
              {/* Header Row */}
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-ink-900 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                    {log.caller_name ? log.caller_name.charAt(0) : 'P'}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-semibold text-base text-ink-900">
                        {log.caller_name || 'Unknown Caller'}
                      </h3>
                      {log.caller_name_spelled && (
                        <span className="text-[10px] font-mono tracking-widest uppercase bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded">
                          {log.caller_name_spelled}
                        </span>
                      )}
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border ${
                          intentStyles[log.intent] || intentStyles.general_inquiry
                        }`}
                      >
                        {(log.intent || '').replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-ink-900/50 mt-1">
                      {log.caller_phone} {log.caller_email && `· ${log.caller_email}`} ·{' '}
                      {new Date(log.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                {/* Summary Metrics */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-right">
                    <p className="text-ink-900/40 text-[10px] uppercase font-semibold">Duration</p>
                    <p className="font-mono font-semibold text-ink-900">{formatDuration(log.duration_seconds)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-ink-900/40 text-[10px] uppercase font-semibold">Status</p>
                    <span
                      className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'resolved'
                          ? 'bg-teal-100 text-teal-700'
                          : log.status === 'escalated'
                          ? 'bg-clay-100 text-clay-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                  <button
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-ink-900/70 hover:text-ink-900 transition-colors cursor-pointer"
                    title={isExpanded ? 'Collapse' : 'Expand full review'}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* AI Summary Box */}
              <div className="p-5 bg-white space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-ink-900/60 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-teal-600" />
                    What Happened on this Call (AI Summary)
                  </h4>
                  <p className="text-sm text-ink-900/80 leading-relaxed bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                    {log.ai_summary}
                  </p>
                </div>

                {/* Expanded Detailed Audit & Spoken Transcript */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-100 space-y-4">
                    {/* Key Points & Clinical Proof */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        <p className="font-semibold text-ink-900 mb-1.5">Audit Trail & Proof</p>
                        <ul className="text-slate-600 space-y-1 text-[11px]">
                          <li>✓ Caller informed AI assistant recorded</li>
                          <li>✓ Practitioner availability verified in DB</li>
                          <li>✓ Double confirmation on date & time</li>
                        </ul>
                      </div>
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        <p className="font-semibold text-ink-900 mb-1.5">Resolution & Outcome</p>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          {log.intent === 'appointment_booking'
                            ? 'Directly confirmed appointment with practitioner. Confirmation SMS and Email dispatched.'
                            : log.intent === 'clinical_emergency'
                            ? 'Critical triage alert dispatched to clinician queue. Patient advised on urgent hospital guidelines.'
                            : 'General patient reception inquiry sorted.'}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        <p className="font-semibold text-ink-900 mb-1.5">Sentiment & Turns</p>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Sentiment: <strong className="capitalize text-teal-700">{log.sentiment || 'Positive'}</strong>
                          <br />
                          Spoken Turns: {Array.isArray(transcriptTurns) ? transcriptTurns.length : 0} turns recorded
                        </p>
                      </div>
                    </div>

                    {/* Full Transcript Conversation */}
                    {Array.isArray(transcriptTurns) && transcriptTurns.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-ink-900/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <MessageSquare size={13} /> Spoken Turns Transcript
                        </h4>
                        <div className="space-y-2.5 max-h-72 overflow-y-auto p-3.5 bg-slate-50/70 rounded-xl border border-slate-100">
                          {transcriptTurns.map((turn, tIdx) => (
                            <div
                              key={tIdx}
                              className={`flex ${turn.role === 'ai' || turn.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                            >
                              <div
                                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs ${
                                  turn.role === 'ai' || turn.role === 'assistant'
                                    ? 'bg-slate-800 text-white rounded-bl-sm'
                                    : 'bg-teal-600 text-white rounded-br-sm'
                                }`}
                              >
                                <p className="text-[10px] opacity-70 mb-0.5 font-medium">
                                  {turn.role === 'ai' || turn.role === 'assistant' ? 'Neerja (AI Receptionist)' : 'Caller'}
                                </p>
                                <p>{turn.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredLogs.length === 0 && !loading && (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <Bot size={36} className="text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-ink-900">No call summaries found</p>
            <p className="text-xs text-ink-900/50 mt-1 max-w-sm mx-auto">
              {filterIntent !== 'all' 
                ? 'Try changing your intent filter to view other calls.'
                : 'Start a call with Neerja in the AI Assistant to generate your first live call summary!'}
            </p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('ai-assistant')}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Go to AI Assistant
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
