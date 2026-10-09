import { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { DollarSign, Users, CalendarCheck, TrendingUp, Sparkles, Award } from 'lucide-react';

const STATUS_COLORS = {
  completed: '#10B981', // Vibrant Emerald
  booked: '#0EA5E9',    // Vibrant Sky Blue
  missed: '#F43F5E',    // Vibrant Rose
  cancelled: '#94A3B8', // Neutral Slate
};

const STATUS_LABELS = {
  completed: 'Completed Visits',
  booked: 'Booked / Scheduled',
  missed: 'Missed Appointments',
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
        <p className="text-[10px] text-slate-400 mt-0.5">Billed from completed procedures</p>
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

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getAnalytics().then(setData);
  }, []);

  if (!data) {
    return (
      <div className="py-20 text-center">
        <div className="w-10 h-10 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500 font-medium">Computing live clinical analytics...</p>
      </div>
    );
  }

  const totalAppointmentsLogged = data.statusBreakdown
    ? data.statusBreakdown.reduce((s, r) => s + r.count, 0)
    : 0;

  return (
    <div className="max-w-6xl space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
          Clinical & Financial Analytics
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Computed live from stored appointments, completed treatments, and patient records.
        </p>
      </div>

      {/* Top 3 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Billed Revenue</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="font-display text-3xl sm:text-4xl font-extrabold text-emerald-700">
            ${data.totalRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">Generated from completed clinical appointments</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Registered Patients</span>
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Users size={20} />
            </div>
          </div>
          <p className="font-display text-3xl sm:text-4xl font-extrabold text-slate-800">
            {data.totalPatients}
          </p>
          <p className="text-xs text-slate-500 mt-1">Active patients across all practice operatories</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Appointments</span>
            <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <CalendarCheck size={20} />
            </div>
          </div>
          <p className="font-display text-3xl sm:text-4xl font-extrabold text-sky-700">
            {totalAppointmentsLogged}
          </p>
          <p className="text-xs text-slate-500 mt-1">Scheduled, completed, and logged in system</p>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue Trend */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="font-display font-bold text-base text-slate-900">Revenue Performance by Month</h2>
              <p className="text-xs text-slate-500 mt-0.5">Historical monthly billing trends</p>
            </div>
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full">
              6-Month Trend
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenueByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} />
                <Tooltip content={<RevenueCustomTooltip />} cursor={{ fill: 'rgba(14, 165, 233, 0.08)' }} />
                <Bar dataKey="revenue" fill="#0D9488" radius={[6, 6, 0, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Appointment Status Breakdown */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="font-display font-bold text-base text-slate-900">Appointment Status Distribution</h2>
              <p className="text-xs text-slate-500 mt-0.5">Proportion of completed, booked, and missed appointments</p>
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.statusBreakdown}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  animationDuration={1000}
                >
                  {data.statusBreakdown.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={STATUS_COLORS[entry.status] || '#CBD5E1'}
                      className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                    />
                  ))}
                </Pie>
                <Tooltip content={<StatusCustomTooltip totalCount={totalAppointmentsLogged} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Interactive Legend with distinct colors */}
          <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-100">
            {data.statusBreakdown.map((s) => {
              const color = STATUS_COLORS[s.status] || '#CBD5E1';
              const label = STATUS_LABELS[s.status] || s.status;
              const pct = totalAppointmentsLogged > 0 ? Math.round((s.count / totalAppointmentsLogged) * 100) : 0;
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

      {/* Practitioner Revenue Breakdown */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="font-display font-bold text-base text-slate-900">Revenue Performance by Practitioner</h2>
            <p className="text-xs text-slate-500 mt-0.5">Visits handled and total billed treatment fees</p>
          </div>
          <Award size={18} className="text-amber-500" />
        </div>

        <div className="space-y-4">
          {data.topPractitioners.map((p) => {
            const maxRev = Math.max(...data.topPractitioners.map((x) => x.revenue || 0), 1);
            const pct = Math.round(((p.revenue || 0) / maxRev) * 100);

            return (
              <div key={p.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                    <span className="text-slate-400">· {p.appointment_count} visits completed</span>
                  </div>
                  <span className="font-extrabold text-teal-800 text-sm">
                    ${p.revenue?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
