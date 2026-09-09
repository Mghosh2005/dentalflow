import { useEffect, useState } from 'react';
import { CalendarCheck, HeartHandshake, DollarSign, TrendingUp, PhoneMissed, XCircle, RefreshCw, ArrowUpRight, Send } from 'lucide-react';
import { api } from '../api/client';
import StatCard from '../components/StatCard';

export default function Dashboard({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, a, ac] = await Promise.all([
      api.getDashboardSummary(),
      api.getAlerts(),
      api.getSuggestedActions(),
    ]);
    setSummary(s);
    setAlerts(a);
    setActions(ac);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">Dashboard</h1>
          <p className="text-ink-900/50 text-sm mt-1">{today}</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-ink-900 text-white hover:bg-ink-800 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="mb-6 rounded-xl border border-clay-600/20 bg-clay-100 px-5 py-4 flex items-center justify-between">
          <p className="text-sm text-clay-600">
            <span className="font-semibold">Attention needed:</span> {alerts.length} active alert{alerts.length !== 1 ? 's' : ''} require review.
          </p>
          <button onClick={() => onNavigate('alerts')} className="text-sm font-medium text-clay-600 flex items-center gap-1 shrink-0">
            View alerts <ArrowUpRight size={14} />
          </button>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Today's appointments" value={summary.todaysAppointments} icon={CalendarCheck} />
          <StatCard label="Active patients" value={summary.activePatients} icon={HeartHandshake} />
          <StatCard label="Revenue protected" value={`$${summary.revenueProtected.toLocaleString()}`} icon={DollarSign} accent="teal" valueTone="teal" />
          <StatCard label="Conversion rate" value={`${summary.conversionRate}%`} icon={TrendingUp} accent="teal" valueTone="teal" />
          <StatCard label="Missed calls" value={summary.missedCalls} icon={PhoneMissed} valueTone={summary.missedCalls > 0 ? 'clay' : 'default'} />
          <StatCard label="Missed appointments" value={summary.missedAppointments} icon={XCircle} valueTone={summary.missedAppointments > 0 ? 'clay' : 'default'} />
          <StatCard label="Pending follow-ups" value={summary.pendingFollowUps} icon={Send} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink-900 mb-1">Daily briefing</h2>
          <p className="text-sm text-ink-900/50 mb-4">A quick read on what happened today and what needs action.</p>
          {summary && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <MiniStat label="Calls answered" value={summary.missedCalls === 0 ? '—' : summary.missedCalls} />
              <MiniStat label="Booked today" value={summary.todaysAppointments} />
              <MiniStat label="Pending follow-ups" value={summary.pendingFollowUps} />
              <MiniStat label="Revenue protected" value={`$${summary.revenueProtected.toLocaleString()}`} />
            </div>
          )}
          <ul className="space-y-2 text-sm text-ink-900/70">
            <li>→ Call back {summary?.missedCalls ?? 0} missed enquiries</li>
            <li>→ Approve pending follow-up messages</li>
            <li>→ Rebook no-show patients</li>
            <li>→ Confirm tomorrow's appointments</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink-900 mb-1">Suggested actions</h2>
          <p className="text-sm text-ink-900/50 mb-4">Prioritized by likely impact on patient care and revenue.</p>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div key={i} className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 last:border-0 last:pb-0">
                <div>
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1
                    ${a.priority === 'high' ? 'bg-clay-100 text-clay-600' : 'bg-ink-900/[0.06] text-ink-900/60'}`}>
                    {a.priority === 'high' ? 'High' : 'Medium'}
                  </span>
                  <p className="text-sm font-medium text-ink-900">{a.title}</p>
                  <p className="text-xs text-ink-900/50">{a.detail}</p>
                </div>
                <button
                  onClick={() => onNavigate('followups')}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-black/10 text-ink-900/70 hover:bg-ink-900/5 shrink-0"
                >
                  View
                </button>
              </div>
            ))}
            {actions.length === 0 && <p className="text-sm text-ink-900/40">Nothing needs attention right now.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-ink-900/[0.03] rounded-lg px-3 py-2">
      <p className="font-display font-semibold text-ink-900">{value}</p>
      <p className="text-xs text-ink-900/50">{label}</p>
    </div>
  );
}
