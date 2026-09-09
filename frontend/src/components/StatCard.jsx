export default function StatCard({ label, value, accent = 'neutral', icon: Icon, valueTone }) {
  const chipStyles = {
    neutral: 'bg-ink-900/[0.06] text-ink-900/60',
    teal: 'bg-teal-100 text-teal-600',
    clay: 'bg-clay-100 text-clay-600',
  };

  const valueStyles = {
    default: 'text-ink-900',
    teal: 'text-teal-600',
    clay: 'text-clay-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className={`font-display font-semibold text-3xl ${valueStyles[valueTone || 'default']}`}>{value}</p>
          <p className="text-sm text-ink-900/45 mt-1">{label}</p>
        </div>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${chipStyles[accent]}`}>
            <Icon size={17} />
          </div>
        )}
      </div>
    </div>
  );
}
