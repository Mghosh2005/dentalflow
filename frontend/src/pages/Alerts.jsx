import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AlertTriangle } from 'lucide-react';

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

  const load = () => api.getAlerts().then(setAlerts);
  useEffect(() => { load(); }, []);

  const dismiss = async (id) => {
    await api.dismissAlert(id);
    load();
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Alerts</h1>
      <p className="text-ink-900/50 text-sm mb-6">Active alerts requiring your attention.</p>

      <div className="space-y-3">
        {alerts.map((a) => (
          <div key={a.id} className={`rounded-xl border px-5 py-4 flex items-start gap-4 ${severityStyles[a.severity]}`}>
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-ink-900/60" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-ink-900">{a.title}</p>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${severityBadge[a.severity]}`}>{a.severity}</span>
              </div>
              <p className="text-sm text-ink-900/60">{a.message}</p>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-black/10 text-ink-900/60 hover:bg-black/5 shrink-0"
            >
              Dismiss
            </button>
          </div>
        ))}
        {alerts.length === 0 && <p className="text-sm text-ink-900/40 py-8 text-center">No active alerts.</p>}
      </div>
    </div>
  );
}
