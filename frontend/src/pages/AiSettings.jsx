import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Field, inputClass, SubmitButton } from '../components/FormField';
import VoiceAgentSimulator from '../components/VoiceAgentSimulator';

export default function AiSettings() {
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [voiceSelection, setVoiceSelection] = useState('en-IN-NeerjaExpressiveNeural');
  
  useEffect(() => {
    api.getAiSettings().then(data => {
      setSettings(data);
      const isIndianVoice = data.voice_id && (data.voice_id.includes('-IN-') || data.voice_id === 'anjali');
      setVoiceSelection(isIndianVoice ? data.voice_id : 'en-IN-NeerjaExpressiveNeural');
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.target);
    const voiceId = form.get('voice_id');
    const voiceNames = {
      'en-IN-NeerjaExpressiveNeural': 'Neerja (Expressive Female)',
      'en-IN-NeerjaNeural': 'Neerja (Professional Female)',
      'hi-IN-SwaraNeural': 'Swara (Hindi Female)',
      'en-IN-PrabhatNeural': 'Prabhat (Indian English Male)',
      'hi-IN-MadhurNeural': 'Madhur (Hindi Male)',
      anjali: 'Anjali (ElevenLabs)',
      custom: 'Custom',
    };
    const data = {
      greeting_script: form.get('greeting_script'),
      voice_id: voiceId,
      voice_name: voiceNames[voiceId] || 'Neerja (Expressive Female)',
      language: form.get('language'),
      enable_sms_confirmation: form.get('enable_sms_confirmation') === 'on' ? 1 : 0,
      enable_email_confirmation: form.get('enable_email_confirmation') === 'on' ? 1 : 0,
      enable_whatsapp_confirmation: form.get('enable_whatsapp_confirmation') === 'on' ? 1 : 0,
      after_hours_enabled: form.get('after_hours_enabled') === 'on' ? 1 : 0,
      emergency_forward_phone: form.get('emergency_forward_phone'),
    };
    const updated = await api.updateAiSettings(data);
    setSettings(updated);
    setSaving(false);
  };
  
  if (!settings) return null;

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-ink-900 mb-1">AI Voice Receptionist</h1>
        <p className="text-ink-900/50 text-sm">Configure how Neerja handles incoming calls and test your live voice agent.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Settings Form */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">

        <form onSubmit={handleSave} className="space-y-6">
          
          <div className="space-y-4 border-b border-black/5 pb-6">
            <h2 className="text-lg font-semibold text-ink-900">Greeting Script</h2>
            <Field label="Custom Greeting">
              <textarea 
                name="greeting_script" 
                className={inputClass} 
                rows={3} 
                defaultValue={settings.greeting_script}
                placeholder="Hello! You've reached {practice_name}. How can I help you today?" 
              />
              <p className="text-xs text-ink-900/40 mt-1">Use {'{practice_name}'} to insert your practice name.</p>
            </Field>
          </div>

          <div className="space-y-4 border-b border-black/5 pb-6">
            <h2 className="text-lg font-semibold text-ink-900">Voice & Language</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Voice Selection">
                <select 
                  name="voice_id" 
                  className={inputClass} 
                  value={voiceSelection}
                  onChange={(e) => setVoiceSelection(e.target.value)}
                >
                  <option value="en-IN-NeerjaExpressiveNeural">Neerja — Indian English Female (Expressive · Active)</option>
                  <option value="en-IN-NeerjaNeural">Neerja — Indian English Female (Professional)</option>
                </select>
              </Field>
              <Field label="Operating Language">
                <select name="language" className={inputClass} defaultValue={settings.language || 'en-IN'}>
                  <option value="en-IN">English (India)</option>
                  <option value="hi-IN">Hindi (India)</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="es-ES">Spanish</option>
                  <option value="fr-FR">French</option>
                </select>
              </Field>
            </div>
            
            {voiceSelection === 'custom' && (
              <div className="mt-4 p-4 border-2 border-dashed border-slate-200 rounded-lg text-center bg-slate-50">
                <p className="text-sm font-medium text-ink-900/40">Voice cloning coming soon</p>
                <input type="file" disabled className="hidden" />
              </div>
            )}
          </div>

          <div className="space-y-4 border-b border-black/5 pb-6">
            <h2 className="text-lg font-semibold text-ink-900">Automated Confirmations</h2>
            <p className="text-sm text-ink-900/60 mb-2">Send automatic booking confirmations via:</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-ink-900 cursor-pointer">
                <input type="checkbox" name="enable_sms_confirmation" defaultChecked={settings.enable_sms_confirmation} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4" />
                SMS
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-900 cursor-pointer">
                <input type="checkbox" name="enable_email_confirmation" defaultChecked={settings.enable_email_confirmation} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4" />
                Email
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-900 cursor-pointer">
                <input type="checkbox" name="enable_whatsapp_confirmation" defaultChecked={settings.enable_whatsapp_confirmation} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4" />
                WhatsApp
              </label>
            </div>
          </div>

          <div className="space-y-4 pb-2">
            <h2 className="text-lg font-semibold text-ink-900">After Hours & Emergency</h2>
            <label className="flex items-center gap-2 text-sm text-ink-900 mb-4 cursor-pointer">
              <input type="checkbox" name="after_hours_enabled" defaultChecked={settings.after_hours_enabled} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4" />
              Enable After-Hours AI Receptionist
            </label>
            <Field label="Emergency Forward Number">
              <input 
                type="tel" 
                name="emergency_forward_phone" 
                className={inputClass} 
                defaultValue={settings.emergency_forward_phone}
                placeholder="+1 (555) 000-0000" 
              />
              <p className="text-xs text-ink-900/40 mt-1">Number to route clinical emergencies to.</p>
            </Field>
          </div>

          <div className="pt-4">
            <SubmitButton disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</SubmitButton>
          </div>
        </form>
      </div>

      {/* Right Column: Interactive Voice Sandbox */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Test Your Agent
            </h2>
            <p className="text-xs text-ink-900/50 mt-0.5">
              Live interactive voice sandbox. Test spoken greeting, booking logic, and emergency handling right now.
            </p>
          </div>

          <VoiceAgentSimulator mode="embedded" />
        </div>
      </div>
    </div>
  </div>
);
}

