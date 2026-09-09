import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

const STATUS_COLORS = { completed: '#2A6E68', booked: '#132038', missed: '#B8483D', cancelled: '#C7CBD1' };

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => { api.getAnalytics().then(setData); }, []);

  if (!data) return <p className="text-sm text-ink-900/40">Loading analytics…</p>;

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Analytics</h1>
      <p className="text-ink-900/50 text-sm mb-6">Computed live from stored appointment and patient data.</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="font-display text-3xl font-semibold text-ink-900">${data.totalRevenue.toLocaleString()}</p>
          <p className="text-sm text-ink-900/50 mt-1">Total revenue (completed visits)</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="font-display text-3xl font-semibold text-ink-900">{data.totalPatients}</p>
          <p className="text-sm text-ink-900/50 mt-1">Total patients on record</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="font-display text-3xl font-semibold text-ink-900">
            {data.statusBreakdown.reduce((s, r) => s + r.count, 0)}
          </p>
          <p className="text-sm text-ink-900/50 mt-1">Total appointments logged</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink-900 mb-4">Revenue by month</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.revenueByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => `$${v}`} />
              <Bar dataKey="revenue" fill="#2A6E68" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-display font-semibold text-ink-900 mb-4">Appointment status breakdown</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.statusBreakdown} dataKey="count" nameKey="status" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {data.statusBreakdown.map((entry, i) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.status] || '#999'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {data.statusBreakdown.map((s) => (
              <span key={s.status} className="text-xs flex items-center gap-1.5 text-ink-900/60 capitalize">
                <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s.status] || '#999' }} />
                {s.status} ({s.count})
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-display font-semibold text-ink-900 mb-4">Revenue by practitioner</h2>
        <div className="space-y-3">
          {data.topPractitioners.map((p) => (
            <div key={p.name} className="flex items-center justify-between text-sm">
              <span className="text-ink-900 font-medium">{p.name}</span>
              <span className="text-ink-900/50">{p.appointment_count} visits · ${p.revenue?.toLocaleString() || 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
