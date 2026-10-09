import { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  Send, CheckCircle2, Clock, PhoneMissed, CalendarX, Bell, AlertCircle,
  Plus, Check, X, Pencil, Sparkles, MessageSquare, ShieldCheck
} from 'lucide-react';
import Modal from '../components/Modal';
import { Field, inputClass, SubmitButton } from '../components/FormField';

const triggerConfig = {
  appointment_reminder: {
    label: 'Appointment Reminder (30 min)',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    icon: Bell,
    description: 'Triggered 30 mins before scheduled appointment',
  },
  no_show: {
    label: 'No-Show Follow-up',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    icon: CalendarX,
    description: 'Triggered when patient missed their scheduled check-up',
  },
  cancellation: {
    label: 'Cancelled Appointment Follow-up',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: CalendarX,
    description: 'Triggered when an appointment was cancelled',
  },
  missed_call: {
    label: 'Missed-Call Follow-up',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: PhoneMissed,
    description: 'Triggered from unanswered after-hours or busy call',
  },
};

export default function FollowUps() {
  const [activeTab, setActiveTab] = useState('automated'); // 'automated' | 'tasks'
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending_approval'); // 'pending_approval' | 'sent' | 'all'
  const [sendingId, setSendingId] = useState(null);
  const [successBanner, setSuccessBanner] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [msgs, fList, pList] = await Promise.all([
        api.getFollowUpMessages().catch(() => []),
        api.getFollowUps().catch(() => []),
        api.getPatients().catch(() => []),
      ]);
      setMessages(msgs || []);
      setTasks(fList || []);
      setPatients(pList || []);
    } catch (err) {
      console.error('Error loading follow-ups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Approve & Send action directly per PDF
  const handleApproveAndSend = async (messageId) => {
    setSendingId(messageId);
    setSuccessBanner('');
    try {
      const res = await api.sendFollowUpMessage(messageId);
      setSuccessBanner(res.message || 'Follow-up message approved and dispatched successfully!');
      setTimeout(() => setSuccessBanner(''), 6000);
      loadData();
    } catch (err) {
      alert(`Failed to send follow-up message: ${err.message}`);
    } finally {
      setSendingId(null);
    }
  };

  // Handle Cancel Message
  const handleCancelMessage = async (messageId) => {
    if (!confirm('Are you sure you want to dismiss this prepared follow-up?')) return;
    try {
      await api.cancelFollowUpMessage(messageId);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Save edited message text
  const handleSaveEditedText = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const newText = form.get('message_text');
    try {
      await api.updateFollowUpMessage(editingMessage.id, { message_text: newText });
      setEditingMessage(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Manual tasks completion
  const completeTask = async (id) => {
    await api.completeFollowUp(id);
    loadData();
  };

  // Create manual task
  const handleAddTask = async (e) => {
    e.preventDefault();
    setSavingTask(true);
    const form = new FormData(e.target);
    await api.createFollowUp({
      patient_id: Number(form.get('patient_id')),
      type: form.get('type'),
      priority: form.get('priority'),
      due_date: form.get('due_date'),
      notes: form.get('notes'),
    });
    setSavingTask(false);
    setShowAddTask(false);
    loadData();
  };

  const pendingCount = messages.filter((m) => m.status === 'pending_approval').length;

  const filteredMessages = messages.filter((m) => {
    if (filterStatus === 'pending_approval') return m.status === 'pending_approval';
    if (filterStatus === 'sent') return m.status === 'sent' || m.status === 'approved';
    return true;
  });

  return (
    <div className="max-w-5xl space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">
            Follow-Ups & Automated Messaging
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            DentalFlow automatically prepares situational follow-ups ready for one-click staff approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'tasks' && (
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all"
            >
              <Plus size={14} /> Add Recall Task
            </button>
          )}
        </div>
      </div>

      {/* Success Banner */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>{successBanner}</span>
          </div>
          <button onClick={() => setSuccessBanner('')} className="text-emerald-700 hover:text-emerald-900">
            ✕
          </button>
        </div>
      )}

      {/* Navigation Mode Tabs */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('automated')}
            className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'automated'
                ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sparkles size={14} />
            <span>Automated Follow-Up Queue</span>
            {pendingCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'automated' ? 'bg-white text-teal-800' : 'bg-rose-500 text-white'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'tasks'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <MessageSquare size={14} />
            <span>Manual Tasks & Recalls ({tasks.length})</span>
          </button>
        </div>

        {/* Status Filter for Automated Queue */}
        {activeTab === 'automated' && (
          <div className="flex items-center gap-1">
            {[
              { id: 'pending_approval', label: 'Pending Approval' },
              { id: 'sent', label: 'Sent / Delivered' },
              { id: 'all', label: 'All Messages' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filterStatus === f.id
                    ? 'bg-slate-200 text-slate-900 font-bold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: AUTOMATED FOLLOW-UP MESSAGES WITH "APPROVE & SEND" PER PDF     */}
      {/* ========================================================================= */}
      {activeTab === 'automated' && (
        <div className="space-y-4">
          {/* Information Notice */}
          <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-600/20 text-xs text-teal-900 flex items-start gap-3">
            <ShieldCheck size={18} className="text-teal-600 shrink-0 mt-0.5" />
            <p>
              DentalFlow proactively prepares tailored communication when key situations occur (appointment reminder 30 min before, no-show, cancellation, or missed call). Simply click <strong className="font-bold underline">Approve & Send</strong> to instantly dispatch the message.
            </p>
          </div>

          {filteredMessages.map((msg) => {
            const config = triggerConfig[msg.trigger_type] || {
              label: msg.trigger_type,
              badgeClass: 'bg-slate-100 text-slate-700',
              icon: MessageSquare,
              description: 'Automated notification'
            };
            const Icon = config.icon;
            const isPending = msg.status === 'pending_approval';

            return (
              <div
                key={msg.id}
                className={`bg-white rounded-3xl border p-6 shadow-sm transition-all ${
                  isPending ? 'border-teal-200/90 hover:border-teal-400' : 'border-slate-200/80 opacity-90'
                }`}
              >
                {/* Header row: Situation Badge + Patient */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${config.badgeClass}`}>
                      <Icon size={13} />
                      {config.label}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      via {(msg.delivery_method || 'sms').toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {msg.status === 'pending_approval' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                        Awaiting Staff Approval
                      </span>
                    )}
                    {msg.status === 'sent' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <Check size={12} /> Sent
                      </span>
                    )}
                    {msg.status === 'cancelled' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-500">
                        Dismissed
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient Information & Trigger Details */}
                <div className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 font-medium">Recipient: </span>
                    <strong className="text-slate-900 font-bold text-sm">
                      {msg.patient_name || 'Patient'}
                    </strong>
                    {msg.patient_phone && (
                      <span className="text-slate-500 font-semibold ml-2">({msg.patient_phone})</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Triggered: {new Date(msg.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Prepared Message Box */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 my-2 relative group">
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-mono">
                    "{msg.message_text}"
                  </p>
                  {isPending && (
                    <button
                      onClick={() => setEditingMessage(msg)}
                      className="absolute top-3 right-3 text-xs font-semibold text-slate-400 hover:text-teal-700 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-xs flex items-center gap-1"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                </div>

                {/* Actions row: "Approve & Send" prominent button per PDF */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">
                    {config.description}
                  </p>

                  <div className="flex items-center gap-2">
                    {isPending ? (
                      <>
                        <button
                          onClick={() => handleCancelMessage(msg.id)}
                          className="px-3 py-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <X size={14} /> Dismiss
                        </button>
                        <button
                          onClick={() => handleApproveAndSend(msg.id)}
                          disabled={sendingId === msg.id}
                          className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                        >
                          <Send size={14} />
                          <span>{sendingId === msg.id ? 'Sending...' : 'Approve & Send'}</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500 italic">
                        {msg.sent_at ? `Dispatched on ${new Date(msg.sent_at).toLocaleDateString()}` : 'Completed'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredMessages.length === 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
              <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
              <h3 className="font-display font-bold text-base text-slate-800">All caught up!</h3>
              <p className="text-xs text-slate-500 mt-1">
                No follow-up messages waiting in this queue. DentalFlow will automatically generate new messages when triggered.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: MANUAL TASKS & RECALLS (Preserved functionality)               */}
      {/* ========================================================================= */}
      {activeTab === 'tasks' && (
        <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs">
          {tasks.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    f.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {f.priority}
                  </span>
                  <p className="text-sm font-bold text-slate-900 capitalize">
                    {f.type?.replace('_', ' ')}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  <strong className="text-slate-800">{f.patient_name}</strong> · {f.notes}
                </p>
              </div>
              <button
                onClick={() => completeTask(f.id)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
              >
                <Check size={13} /> Mark Done
              </button>
            </div>
          ))}

          {tasks.length === 0 && (
            <p className="px-6 py-12 text-center text-xs text-slate-400">
              No manual recall tasks pending.
            </p>
          )}
        </div>
      )}

      {/* Edit Follow-up Message Text Modal */}
      {editingMessage && (
        <Modal title="Edit Prepared Follow-Up Message" onClose={() => setEditingMessage(null)}>
          <form onSubmit={handleSaveEditedText} className="space-y-4">
            <p className="text-xs text-slate-500">
              Customize the message text before approving and sending to <strong>{editingMessage.patient_name}</strong>:
            </p>
            <Field label="Message Text">
              <textarea
                name="message_text"
                rows={5}
                defaultValue={editingMessage.message_text}
                required
                className={inputClass}
              />
            </Field>
            <SubmitButton>Save & Prepare</SubmitButton>
          </form>
        </Modal>
      )}

      {/* Add Manual Task Modal */}
      {showAddTask && (
        <Modal title="Add Recall Task" onClose={() => setShowAddTask(false)}>
          <form onSubmit={handleAddTask} className="space-y-4">
            <Field label="Patient">
              <select name="patient_id" required className={inputClass}>
                <option value="">Select a patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select name="type" required className={inputClass}>
                <option value="recall">Hygiene Recall</option>
                <option value="no_show_rebook">No-show Rebooking</option>
                <option value="pending_message">Message Approval</option>
                <option value="consult_followup">Consultation Follow-up</option>
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" className={inputClass}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="Due Date">
              <input name="due_date" type="date" required className={inputClass} />
            </Field>
            <Field label="Notes">
              <input name="notes" className={inputClass} placeholder="Reason for follow-up..." />
            </Field>
            <SubmitButton disabled={savingTask}>
              {savingTask ? 'Saving...' : 'Add Task'}
            </SubmitButton>
          </form>
        </Modal>
      )}
    </div>
  );
}
