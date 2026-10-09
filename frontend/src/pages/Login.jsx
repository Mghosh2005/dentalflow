import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Stethoscope, ShieldCheck, UserCheck, ArrowRight, Lock, User, Eye, EyeOff, Sparkles } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [userType, setUserType] = useState('staff'); // 'staff' | 'patient'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const switchType = (type) => {
    setUserType(type);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (type) => {
    setError('');
    setLoading(true);
    try {
      if (type === 'staff') {
        await login('admin', 'admin123');
      } else {
        await login('c.white', 'patient123');
      }
    } catch (err) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1522] via-[#132038] to-[#1C2E4A] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 sm:p-10 relative z-10 transition-all">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/30 mb-3">
            <Stethoscope size={28} />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
            DentalFlow
          </h1>
          <p className="text-xs sm:text-sm text-ink-900/60 mt-1">
            Intelligent Dental Practice Management & Patient Portal
          </p>
        </div>

        {/* User Type Switcher Tabs */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => switchType('staff')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              userType === 'staff'
                ? 'bg-white text-ink-900 shadow-sm border border-black/5'
                : 'text-ink-900/60 hover:text-ink-900'
            }`}
          >
            <ShieldCheck size={16} className={userType === 'staff' ? 'text-teal-600' : ''} />
            Owner / Staff
          </button>
          <button
            type="button"
            onClick={() => switchType('patient')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              userType === 'patient'
                ? 'bg-white text-ink-900 shadow-sm border border-black/5'
                : 'text-ink-900/60 hover:text-ink-900'
            }`}
          >
            <UserCheck size={16} className={userType === 'patient' ? 'text-teal-600' : ''} />
            Patient Portal
          </button>
        </div>

        {/* Portal Description Banner */}
        <div className="mb-6 px-4 py-3 rounded-xl bg-teal-50 border border-teal-600/15 text-xs text-teal-800 flex items-start gap-2.5">
          <Sparkles size={16} className="text-teal-600 shrink-0 mt-0.5" />
          {userType === 'staff' ? (
            <p>
              <strong className="font-semibold">Owner / Staff Access:</strong> Complete clinical management, appointments, patients, automated follow-ups & AI receptionist.
            </p>
          ) : (
            <p>
              <strong className="font-semibold">Patient Access:</strong> Simplified portal to view your next visit, book appointments & review your treatment plan.
            </p>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
            {error}
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-900 uppercase tracking-wider mb-1.5">
              {userType === 'staff' ? 'Staff Username' : 'Patient Username / ID'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-900/40">
                <User size={16} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-ink-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all font-medium"
                placeholder={userType === 'staff' ? 'Enter staff username' : 'Enter patient username or ID'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-900 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-900/40">
                <Lock size={16} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-ink-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all font-medium"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-ink-900/40 hover:text-ink-900"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <span>Signing in...</span>
            ) : (
              <>
                <span>Sign in as {userType === 'staff' ? 'Staff' : 'Patient'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Login Divider: Only visible when explicitly enabled in local development */}
        {import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_LOGINS === 'true' && (
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-900/40 text-center mb-3">
              Development Quick Demo Login
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleDemoLogin('staff')}
                disabled={loading}
                className="py-2 px-3 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-ink-900 rounded-xl border border-black/5 flex flex-col items-center justify-center transition-all text-center leading-tight"
              >
                <span>Demo Staff</span>
                <span className="text-[10px] text-ink-900/50 font-normal">admin</span>
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('patient')}
                disabled={loading}
                className="py-2 px-3 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-ink-900 rounded-xl border border-black/5 flex flex-col items-center justify-center transition-all text-center leading-tight"
              >
                <span>Demo Patient</span>
                <span className="text-[10px] text-ink-900/50 font-normal">c.white</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-white/40">
        DentalFlow v2.0 · Protected with AES & JWT Authentication
      </p>
    </div>
  );
}
