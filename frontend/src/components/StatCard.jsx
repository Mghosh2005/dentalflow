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
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className={`font-display font-semibold text-2xl sm:text-3xl ${valueStyles[valueTone || 'default']} truncate`}>{value}</p>
          <p className="text-xs sm:text-sm text-ink-900/45 mt-1 leading-tight">{label}</p>
        </div>
        {Icon && (
          <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${chipStyles[accent]}`}>
            <Icon size={16} className="sm:w-[17px] sm:h-[17px]" />
          </div>
        )}
      </div>
    </div>
  );
}
