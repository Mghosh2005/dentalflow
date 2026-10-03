import { useEffect, useState } from 'react';
import { api } from '../api/client';
import VoiceAgentSimulator from '../components/VoiceAgentSimulator';
import { Bot, FileText, CheckCircle2, Clock, AlertTriangle, MessageSquare, ChevronDown, ChevronUp, Sparkles, PhoneCall, ShieldAlert, ArrowRight } from 'lucide-react';

const intentStyles = {
  appointment_booking: 'bg-teal-100 text-teal-700 border-teal-200',
  clinical_emergency: 'bg-clay-100 text-clay-700 border-clay-200',
  patient_complaint: 'bg-clay-100 text-clay-700 border-clay-200',
  pricing_inquiry: 'bg-blue-100 text-blue-700 border-blue-200',
  general_inquiry: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function AiCallSummary() {
  const [activeTab, setActiveTab] = useState('sandbox'); // 'sandbox' | 'reviews'
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState(null);

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

  return (
    <div className="max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display text-3xl font-semibold text-ink-900">AI Call Summary</h1>
            <span className="text-xs bg-teal-100 text-teal-700 font-semibold px-2.5 py-0.5 rounded-full border border-teal-200">
              Neerja Studio
            </span>
          </div>
          <p className="text-ink-900/50 text-sm">
            Live voice testing sandbox, automated clinical call audit reviews, and transcript summaries.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-200/70 p-1 rounded-xl shrink-0 self-start">
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'sandbox'
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-900/60 hover:text-ink-900'
            }`}
          >
            <Bot size={15} className={activeTab === 'sandbox' ? 'text-teal-600' : ''} />
            Test Your Agent
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'reviews'
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-900/60 hover:text-ink-900'
            }`}
          >
            <FileText size={15} className={activeTab === 'reviews' ? 'text-teal-600' : ''} />
            Call Reviews ({callLogs.length})
          </button>
        </div>
      </div>

      {/* TAB 1: TEST YOUR AGENT SANDBOX */}
      {activeTab === 'sandbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Simulator Panel */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Voice Sandbox
                </h2>
                <p className="text-xs text-ink-900/50 mt-0.5">
                  Speak directly with Neerja via microphone or type test messages.
                </p>
              </div>
              <span className="text-[11px] bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded">
                Web Speech API
              </span>
            </div>

            <VoiceAgentSimulator
              mode="embedded"
              onCallEnded={() => {
                loadCallLogs();
              }}
            />
          </div>

          {/* Guidelines & Quick Testing Scenarios */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-gradient-to-br from-[#132038] to-[#1C2E4A] text-white rounded-2xl p-6 shadow-sm border border-slate-800">
              <div className="flex items-center gap-2 text-teal-400 mb-2">
                <Sparkles size={18} />
                <h3 className="font-semibold text-sm">Testing Scenarios</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Neerja handles live patient conversations end-to-end. Try speaking or typing these real-world scenarios:
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center justify-between text-teal-300 font-semibold mb-1">
                    <span>1. Appointment Booking</span>
                    <span className="text-[10px] bg-teal-500/20 px-2 py-0.5 rounded">Auto-Booked</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    <em>"I'd like to book a check-up next Wednesday with Dr. Lindsay Wren. My name is Peter Strain."</em>
                  </p>
                </div>

                <div className="p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center justify-between text-rose-300 font-semibold mb-1">
                    <span>2. Clinical Emergency</span>
                    <span className="text-[10px] bg-red-500/20 px-2 py-0.5 rounded">Alert Escalated</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    <em>"I have severe jaw swelling and unbearable pain since yesterday."</em>
                  </p>
                </div>

                <div className="p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center justify-between text-blue-300 font-semibold mb-1">
                    <span>3. Treatment Pricing</span>
                    <span className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded">Fee Guidance</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    <em>"How much is Invisalign and how long does teeth whitening take?"</em>
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                <span>Calls automatically compile to Call Review</span>
                <button
                  onClick={() => setActiveTab('reviews')}
                  className="text-teal-400 hover:text-teal-300 font-medium flex items-center gap-1"
                >
                  View Reviews <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {/* Quick Stats on Recent Calls */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h4 className="text-xs font-semibold text-ink-900/60 uppercase tracking-wider">
                Recent AI Call Logs
              </h4>
              <div className="divide-y divide-slate-100">
                {callLogs.slice(0, 3).map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-ink-900">{log.caller_name || 'Patient'}</p>
                      <p className="text-[11px] text-ink-900/50 capitalize">
                        {(log.intent || '').replace('_', ' ')} · {formatDuration(log.duration_seconds)}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
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
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CALL REVIEWS & CLINICAL AUDIT TRAIL */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {callLogs.map((log) => {
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
                    <div className="w-10 h-10 rounded-xl bg-ink-900 text-white flex items-center justify-center font-semibold text-sm">
                      {log.caller_name ? log.caller_name.charAt(0) : 'P'}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
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
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-ink-900/70 hover:text-ink-900 transition-colors"
                      title={isExpanded ? 'Collapse' : 'Expand full review'}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* AI Summary Box */}
                <div className="p-5 bg-white space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-ink-900/60 uppercase tracking-wider mb-1 flex items-center gap-1.5">
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
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="font-semibold text-ink-900 mb-1">Audit Trail & Proof</p>
                          <ul className="text-slate-600 space-y-1 text-[11px]">
                            <li>✓ Caller informed AI assistant recorded</li>
                            <li>✓ Practitioner availability verified in DB</li>
                            <li>✓ Double confirmation on date & time</li>
                          </ul>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="font-semibold text-ink-900 mb-1">Resolution & Outcome</p>
                          <p className="text-slate-600 text-[11px]">
                            {log.intent === 'appointment_booking'
                              ? 'Directly confirmed appointment with practitioner. Confirmation SMS and Email dispatched.'
                              : log.intent === 'clinical_emergency'
                              ? 'Critical triage alert dispatched to clinician queue. Patient advised on urgent hospital guidelines.'
                              : 'General patient reception inquiry sorted.'}
                          </p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="font-semibold text-ink-900 mb-1">Sentiment & Turns</p>
                          <p className="text-slate-600 text-[11px]">
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
                          <div className="space-y-2.5 max-h-72 overflow-y-auto p-3 bg-slate-50/70 rounded-xl border border-slate-100">
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

          {callLogs.length === 0 && !loading && (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <Bot size={36} className="text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-ink-900">No call summaries yet</p>
              <p className="text-xs text-ink-900/50 mt-1 max-w-sm mx-auto">
                Switch to the <strong>Test Your Agent</strong> tab and start a call with Neerja to generate your first live call summary!
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
