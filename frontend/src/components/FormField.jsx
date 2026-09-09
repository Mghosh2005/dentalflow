export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-ink-900/60 mb-1">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-black/10 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500";

export function SubmitButton({ children, ...props }) {
  return (
    <button
      {...props}
      type="submit"
      className="w-full mt-2 bg-ink-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-ink-800 transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}
