import { useEffect, useState } from 'react';
import { api } from '../api/client';
import VoiceAgentSimulator from '../components/VoiceAgentSimulator';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function AiAssistant({ onNavigate }) {
  const [callLogs, setCallLogs] = useState([]);

  const loadCallLogs = async () => {
    try {
      const data = await api.getCallLogs();
      setCallLogs(data);
    } catch (err) {
      console.error('Failed to load call logs:', err);
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
            <h1 className="font-display text-3xl font-semibold text-ink-900">AI Assistant</h1>
            <span className="text-xs bg-teal-100 text-teal-700 font-semibold px-2.5 py-0.5 rounded-full border border-teal-200">
              Neerja Studio
            </span>
          </div>
          <p className="text-ink-900/50 text-sm">
            Live voice testing sandbox, automated patient reception simulation, and conversational agent testing.
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('call-summary')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-ink-900 hover:bg-slate-50 shadow-sm transition-all self-start md:self-auto cursor-pointer"
          >
            <span>View Call Reviews ({callLogs.length})</span>
            <ArrowRight size={14} className="text-teal-600" />
          </button>
        )}
      </div>

      {/* Main Sandbox Grid */}
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
              Voice & Chat
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

            {onNavigate && (
              <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                <span>Calls compile automatically to Call Reviews</span>
                <button
                  onClick={() => onNavigate('call-summary')}
                  className="text-teal-400 hover:text-teal-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  View Reviews <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Quick Stats on Recent Calls */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-ink-900/60 uppercase tracking-wider">
                Recent AI Call Logs
              </h4>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('call-summary')}
                  className="text-[11px] text-teal-600 hover:text-teal-700 font-medium cursor-pointer"
                >
                  See all
                </button>
              )}
            </div>
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
              {callLogs.length === 0 && (
                <p className="text-xs text-ink-900/40 py-2">No calls logged yet. Start a call to test!</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
