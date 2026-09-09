import { Sparkles } from 'lucide-react';

export default function ComingSoon({ title }) {
  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center mx-auto mb-4">
          <Sparkles size={20} />
        </div>
        <h1 className="font-display text-xl font-semibold text-ink-900 mb-2">{title}</h1>
        <p className="text-sm text-ink-900/50 max-w-sm mx-auto">
          This is part of a later phase of DentalFlow, once the AI receptionist and voice integrations are connected. It's out of scope for the current Phase 1 build.
        </p>
      </div>
    </div>
  );
}
