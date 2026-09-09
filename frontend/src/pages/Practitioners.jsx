import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Stethoscope } from 'lucide-react';

export default function Practitioners() {
  const [list, setList] = useState([]);

  useEffect(() => { api.getPractitioners().then(setList); }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">Practitioners</h1>
      <p className="text-ink-900/50 text-sm mb-6">Everyone on the clinical team.</p>

      <div className="grid grid-cols-3 gap-4">
        {list.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center mb-3">
              <Stethoscope size={17} />
            </div>
            <p className="font-medium text-ink-900">{p.name}</p>
            <p className="text-sm text-ink-900/50">{p.specialty}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
