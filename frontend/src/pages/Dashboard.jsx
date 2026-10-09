import { useEffect, useState } from 'react';
import {
  CalendarCheck, HeartHandshake, DollarSign, TrendingUp, PhoneMissed, XCircle,
  RefreshCw, ArrowUpRight, Send, PhoneIncoming, PhoneForwarded, Bot, Sparkles, Building2
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatCard from '../components/StatCard';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';

// Brighter, distinct color palette for status breakdown per PDF specification
const STATUS_COLORS = {
  completed: '#10B981', // Vibrant Emerald
  booked: '#0EA5E9',    // Vibrant Sky Blue
  missed: '#F43F5E',    // Vibrant Rose
  cancelled: '#94A3B8', // Neutral Slate
};

const STATUS_LABELS = {
  completed: 'Completed Visits',
  booked: 'Upcoming Bookings',
  missed: 'Missed / No-Show',
  cancelled: 'Cancelled Visits',
};

// Custom interactive Tooltip for Monthly Revenue Bar Chart
function RevenueCustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const revenue = payload[0].value;
    return (
      <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-white/10 text-xs">
        <p className="font-semibold text-slate-300">{label}</p>
        <p className="text-base font-bold text-teal-400 mt-0.5">
          ${revenue.toLocaleString()}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">Confirmed visit revenue</p>
      </div>
    );
  }
  return null;
}

// Custom interactive Tooltip for Appointment Status Pie Chart
function StatusCustomTooltip({ active, payload, totalCount }) {
  if (active && payload && payload.length) {
    const item = payload[0];
    const status = item.name;
    const count = item.value;
    const percent = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
    const color = STATUS_COLORS[status] || '#999';

    return (
      <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-white/10 text-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-bold text-white capitalize">{STATUS_LABELS[status] || status}</span>
        </div>
        <p className="text-sm font-semibold text-slate-200">
          {count} appointments <span className="text-slate-400 font-normal">({percent}%)</span>
        </p>
      </div>
    );
  }
  return null;
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const { selectedPractice } = useAuth();
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartKey, setChartKey] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [s, a, ac, an] = await Promise.all([
        api.getDashboardSummary(),
        api.getAlerts(),
        api.getSuggestedActions(),
        api.getAnalytics().catch(() => null),
      ]);
      setSummary(s);
      setAlerts(a || []);
      setActions(ac || []);
      setAnalytics(an);
      setChartKey((prev) => prev + 1); // Trigger smooth reload animation
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedPractice?.id]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const totalStatusAppointments = analytics?.statusBreakdown
    ? analytics.statusBreakdown.reduce((sum, item) => sum + item.count, 0)
    : 0;

  return (
    <div className="max-w-6xl space-y-6 animate-fadeIn pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
              Practice Dashboard
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
              <Building2 size={12} />
              {selectedPractice?.name || 'Downtown'}
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">{today}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-sm active:scale-95"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Reload Live Data</span>
          </button>
        </div>
      </div>

      {/* Attention Alert Banner if Active */}
      {alerts.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <p className="text-xs sm:text-sm text-red-900 font-medium">
              <span className="font-bold">Attention Needed:</span> {alerts.length} active alert{alerts.length !== 1 ? 's' : ''} require clinical review.
            </p>
          </div>
          <button
            onClick={() => onNavigate('alerts')}
            className="text-xs font-bold text-red-700 hover:text-red-900 flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-lg hover:bg-red-100/60 transition-colors"
          >
            View Alerts <ArrowUpRight size={14} />
          </button>
        </div>
      )}

      {/* Main KPI Stat Cards (With slightly brighter accents per PDF) */}
      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Today's Appointments" value={summary.todaysAppointments} icon={CalendarCheck} />
            <StatCard label="Active Patients" value={summary.activePatients} icon={HeartHandshake} />
            <StatCard
              label="Revenue Protected"
              value={`$${summary.revenueProtected.toLocaleString()}`}
              icon={DollarSign}
              accent="teal"
              valueTone="teal"
            />
            <StatCard
              label="Conversion Rate"
              value={`${summary.conversionRate}%`}
              icon={TrendingUp}
              accent="teal"
              valueTone="teal"
            />
            <StatCard
              label="Missed Calls"
              value={summary.missedCalls}
              icon={PhoneMissed}
              valueTone={summary.missedCalls > 0 ? 'clay' : 'default'}
            />
            <StatCard
              label="Missed Appointments"
              value={summary.missedAppointments}
              icon={XCircle}
              valueTone={summary.missedAppointments > 0 ? 'clay' : 'default'}
            />
            <StatCard
              label="Pending Follow-Ups"
              value={summary.pendingFollowUps}
              icon={Send}
              valueTone={summary.pendingFollowUps > 0 ? 'teal' : 'default'}
            />
            <div
              onClick={() => onNavigate('followups')}
              className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-5 text-white flex flex-col justify-between cursor-pointer hover:shadow-lg hover:shadow-teal-600/20 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-200">Automated Follow-ups</span>
                <Send size={16} className="text-teal-200 group-hover:translate-x-1 transition-transform" />
              </div>
              <div>
                <p className="text-xl font-bold">Approve Messages</p>
                <p className="text-xs text-teal-100 mt-0.5">Ready to send with 1 click →</p>
              </div>
            </div>
          </div>

          {/* AI Voice Receptionist Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-teal-600" />
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-slate-500">
                AI Voice Receptionist Performance
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Calls Handled (After Hours)"
                value={summary.callsHandledAfterHours || 0}
                icon={PhoneIncoming}
                accent="teal"
                valueTone="teal"
              />
              <StatCard
                label="Missed Calls Won Back"
                value={summary.missedCallsWonBack || 0}
                icon={PhoneForwarded}
                accent="teal"
                valueTone="teal"
              />
              <StatCard
                label="Treatment Revenue (AI Booked)"
                value={`$${(summary.treatmentRevenueAi || 0).toLocaleString()}`}
                icon={Bot}
                accent="teal"
                valueTone="teal"
              />
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* ANALYTICS GRAPHS ON MAIN DASHBOARD (Directly per PDF section 2)            */}
      {/* ========================================================================= */}
      {analytics && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-teal-600" />
              <h2 className="font-display font-bold text-sm uppercase tracking-wider text-slate-500">
                Live Practice Analytics & Trends
              </h2>
            </div>
            <button
              onClick={() => onNavigate('analytics')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1"
            >
              Full Analytics <ArrowUpRight size={13} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Graph 1: Monthly Revenue Performance */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Revenue Trends (Past 6 Months)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Total completed treatment revenue by month</p>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                  ${analytics.totalRevenue.toLocaleString()} Total
                </span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    key={`rev-${chartKey}`}
                    data={analytics.revenueByMonth}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => `$${val}`}
                    />
                    <Tooltip content={<RevenueCustomTooltip />} cursor={{ fill: 'rgba(14, 165, 233, 0.08)' }} />
                    <Bar
                      dataKey="revenue"
                      fill="#0D9488"
                      radius={[6, 6, 0, 0]}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Graph 2: Appointment Status Breakdown (Donut chart with brighter colors) */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Appointment Breakdown</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Distribution across visit statuses</p>
                </div>
                <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                  {totalStatusAppointments} Total
                </span>
              </div>

              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart key={`pie-${chartKey}`}>
                    <Pie
                      data={analytics.statusBreakdown}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    >
                      {analytics.statusBreakdown.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={STATUS_COLORS[entry.status] || '#CBD5E1'}
                          className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<StatusCustomTooltip totalCount={totalStatusAppointments} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Interactive Legend with clear labels per PDF */}
              <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-100">
                {analytics.statusBreakdown.map((s) => {
                  const color = STATUS_COLORS[s.status] || '#CBD5E1';
                  const label = STATUS_LABELS[s.status] || s.status;
                  const pct = totalStatusAppointments > 0 ? Math.round((s.count / totalStatusAppointments) * 100) : 0;
                  return (
                    <div key={s.status} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-semibold text-slate-700">{label}</span>
                      </div>
                      <span className="font-bold text-slate-900">{s.count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Briefing and Suggested Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-display font-bold text-lg text-slate-900 mb-1">Daily Briefing</h2>
          <p className="text-xs text-slate-500 mb-4">A quick read on clinic operations today.</p>
          {summary && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <MiniStat label="Calls answered" value={summary.missedCalls === 0 ? 'All caught up' : summary.missedCalls} />
              <MiniStat label="Booked today" value={summary.todaysAppointments} />
              <MiniStat label="Pending follow-ups" value={summary.pendingFollowUps} />
              <MiniStat label="Revenue protected" value={`$${summary.revenueProtected.toLocaleString()}`} />
            </div>
          )}
          <ul className="space-y-2 text-xs font-medium text-slate-600 bg-slate-50 p-4 rounded-2xl">
            <li className="flex items-center gap-2">
              <span className="text-teal-600">✓</span> Call back {summary?.missedCalls ?? 0} unanswered patient enquiries
            </li>
            <li className="flex items-center gap-2">
              <span className="text-teal-600">✓</span> Review and click <strong className="text-teal-800">Approve & Send</strong> for automated follow-up messages
            </li>
            <li className="flex items-center gap-2">
              <span className="text-teal-600">✓</span> Rebook no-show patients from yesterday's hygiene schedule
            </li>
            <li className="flex items-center gap-2">
              <span className="text-teal-600">✓</span> Confirm tomorrow's scheduled surgical and ortho visits
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-display font-bold text-lg text-slate-900 mb-1">Suggested Clinical Actions</h2>
          <p className="text-xs text-slate-500 mb-4">Prioritized by direct impact on patient health and revenue protection.</p>
          <div className="space-y-3">
            {actions.map((ac, i) => (
              <div
                key={i}
                className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50 flex items-start gap-3"
              >
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                  ac.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-800'
                }`}>
                  {ac.priority}
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-900">{ac.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{ac.desc}</p>
                </div>
              </div>
            ))}
            {actions.length === 0 && (
              <p className="text-xs text-slate-400 py-6 text-center">No high priority actions needed right now.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
