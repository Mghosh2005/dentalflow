import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import {
  Calendar as CalendarIcon, Clock, Stethoscope, CheckCircle2, ChevronRight, ChevronLeft,
  Sparkles, Plus, AlertCircle, ShieldCheck
} from 'lucide-react';

const APPOINTMENT_TYPES = [
  {
    id: 'hygiene',
    name: 'Hygiene & Cleaning',
    duration: 30,
    fee: 120,
    description: 'Comprehensive dental cleaning, plaque removal, and fluoride polish.',
    icon: '✨',
  },
  {
    id: 'checkup',
    name: 'Routine Check-up & Exam',
    duration: 30,
    fee: 150,
    description: 'Full oral examination, gum health check, and preventive dental review.',
    icon: '🔍',
  },
  {
    id: 'whitening',
    name: 'Teeth Whitening',
    duration: 60,
    fee: 350,
    description: 'In-office professional LED laser whitening for a bright smile.',
    icon: '💎',
  },
  {
    id: 'ortho',
    name: 'Orthodontic / Invisalign Consult',
    duration: 45,
    fee: 220,
    description: '3D digital smile simulation and aligner treatment assessment.',
    icon: '📐',
  },
  {
    id: 'emergency',
    name: 'Emergency Dental Consultation',
    duration: 45,
    fee: 180,
    description: 'Immediate clinical review for toothache, pain, swelling, or trauma.',
    icon: '🚨',
  },
];

const TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM'
];

export default function MyAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // 4-Step Booking Wizard State
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(APPOINTMENT_TYPES[0]);
  const [selectedPractitioner, setSelectedPractitioner] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [selectedTime, setSelectedTime] = useState('10:00 AM');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [appts, practs] = await Promise.all([
        api.getPatientAppointments(),
        api.getPatientPractitioners().catch(() => api.getPractitioners()),
      ]);
      setAppointments(appts || []);
      setPractitioners(practs || []);
      if (practs && practs.length > 0 && !selectedPractitioner) {
        setSelectedPractitioner(practs[0]);
      }
    } catch (err) {
      console.error('Error loading appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openBooking = () => {
    setStep(1);
    setSelectedType(APPOINTMENT_TYPES[0]);
    if (practitioners.length > 0) setSelectedPractitioner(practitioners[0]);
    setBookingSuccess(false);
    setBookingError('');
    setShowBookingModal(true);
  };

  const handleConfirmBooking = async () => {
    setBookingLoading(true);
    setBookingError('');
    try {
      // Parse time string into HH:MM:00
      let [timeStr, modifier] = selectedTime.split(' ');
      let [hours, minutes] = timeStr.split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      const startTime = `${selectedDate}T${formattedTime}`;

      // Calculate end time
      const startDateObj = new Date(startTime);
      const endDateObj = new Date(startDateObj.getTime() + (selectedType.duration || 30) * 60000);
      const endTime = endDateObj.toISOString().slice(0, 19);

      await api.bookPatientAppointment({
        practitioner_id: selectedPractitioner.id,
        appointment_type: selectedType.name,
        reason: selectedType.name,
        date: selectedDate,
        time: formattedTime,
        start_time: startTime,
        end_time: endTime,
        fee: selectedType.fee,
        duration: selectedType.duration,
      });

      setBookingSuccess(true);
      loadData();
    } catch (err) {
      setBookingError(err.message || 'Failed to confirm booking');
    } finally {
      setBookingLoading(false);
    }
  };

  // Split appointments into upcoming and past
  const now = new Date();
  const upcoming = appointments.filter((a) => new Date(a.start_time) >= now && a.status !== 'cancelled');
  const past = appointments.filter((a) => new Date(a.start_time) < now || a.status === 'completed');

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header with New Booking CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-teal-600">Patient Scheduling</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            My Appointments
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your booked dental consultations and schedule new appointments in 4 easy steps.
          </p>
        </div>
        <button
          onClick={openBooking}
          className="shrink-0 bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-2xl font-semibold text-sm shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          <Plus size={18} />
          <span>Book an Appointment</span>
        </button>
      </div>

      {/* Existing Appointments List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Appointments */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
              <CalendarIcon size={18} className="text-teal-600" />
              Upcoming Visits ({upcoming.length})
            </h2>
          </div>

          <div className="space-y-3 flex-1">
            {upcoming.map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-2xl border border-slate-200/80 hover:border-teal-300 transition-all bg-slate-50/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 mb-1.5 capitalize">
                      {a.reason || 'Check-up'}
                    </span>
                    <p className="text-sm font-bold text-slate-900">
                      {new Date(a.start_time).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-teal-700 font-semibold mt-0.5 flex items-center gap-1.5">
                      <Clock size={12} />
                      {new Date(a.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-800">{a.practitioner_name}</p>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 mt-1 inline-block">
                      {a.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {upcoming.length === 0 && (
              <div className="py-10 text-center text-slate-400">
                <CalendarIcon size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-xs">No upcoming appointments scheduled.</p>
              </div>
            )}
          </div>
        </div>

        {/* Past Visits History */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />
              Past Visits History ({past.length})
            </h2>
          </div>

          <div className="space-y-3 flex-1">
            {past.map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-2xl border border-slate-100 bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{a.reason || 'Dental Visit'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(a.start_time).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600">{a.practitioner_name}</p>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 mt-1 inline-block capitalize">
                      {a.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {past.length === 0 && (
              <div className="py-10 text-center text-slate-400">
                <p className="text-xs">No past records found.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4-Step Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-white/20 p-6 sm:p-8 relative my-8 animate-scaleUp">
            {/* Header & Step Indicator */}
            <div className="pb-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-600">
                    Step {step} of 4
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                    {step === 1 && 'Step 1 — Choose Appointment Type'}
                    {step === 2 && 'Step 2 — Choose Practitioner'}
                    {step === 3 && 'Step 3 — Choose Date & Time'}
                    {step === 4 && 'Step 4 — Review & Confirm'}
                  </h2>
                </div>
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-lg transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Step indicator progress bar */}
              <div className="grid grid-cols-4 gap-2 mt-4">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 rounded-full transition-all ${
                      s <= step ? 'bg-teal-600' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Step Contents */}
            <div className="py-6">
              {bookingSuccess ? (
                <div className="py-8 text-center animate-fadeIn">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={36} />
                  </div>
                  <h3 className="font-display text-2xl font-bold text-slate-900 mb-2">
                    Appointment Confirmed!
                  </h3>
                  <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
                    Your appointment for <strong className="text-slate-900">{selectedType.name}</strong> with{' '}
                    <strong className="text-slate-900">{selectedPractitioner?.name}</strong> has been successfully booked for{' '}
                    <strong className="text-slate-900">{selectedDate}</strong> at <strong className="text-slate-900">{selectedTime}</strong>.
                  </p>
                  <button
                    onClick={() => setShowBookingModal(false)}
                    className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {bookingError && (
                    <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-xs font-medium flex items-center gap-2">
                      <AlertCircle size={16} />
                      {bookingError}
                    </div>
                  )}

                  {/* STEP 1: Choose Appointment Type */}
                  {step === 1 && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 mb-2">
                        Select the primary reason for your visit:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {APPOINTMENT_TYPES.map((type) => (
                          <div
                            key={type.id}
                            onClick={() => setSelectedType(type)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                              selectedType.id === type.id
                                ? 'border-teal-600 bg-teal-50/50 shadow-sm'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xl">{type.icon}</span>
                              <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                                ${type.fee} · {type.duration}m
                              </span>
                            </div>
                            <h4 className="font-bold text-sm text-slate-900 mt-2">{type.name}</h4>
                            <p className="text-xs text-slate-500 mt-1 leading-snug">{type.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 2: Choose Practitioner */}
                  {step === 2 && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 mb-2">
                        Select your preferred dentist or hygienist:
                      </p>
                      <div className="space-y-3">
                        {practitioners.map((pract) => (
                          <div
                            key={pract.id}
                            onClick={() => setSelectedPractitioner(pract)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer flex items-center justify-between transition-all ${
                              selectedPractitioner?.id === pract.id
                                ? 'border-teal-600 bg-teal-50/50 shadow-sm'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-teal-600/10 text-teal-700 flex items-center justify-center font-bold text-base">
                                <Stethoscope size={22} />
                              </div>
                              <div>
                                <h4 className="font-bold text-sm text-slate-900">{pract.name}</h4>
                                <p className="text-xs text-slate-500 mt-0.5">{pract.specialty || 'General Practitioner'}</p>
                                <span className="inline-block text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mt-1">
                                  Available this week
                                </span>
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              selectedPractitioner?.id === pract.id
                                ? 'border-teal-600 bg-teal-600 text-white'
                                : 'border-slate-300'
                            }`}>
                              {selectedPractitioner?.id === pract.id && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 3: Choose Date & Time */}
                  {step === 3 && (
                    <div className="space-y-5">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Preferred Date
                        </label>
                        <input
                          type="date"
                          value={selectedDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 font-semibold text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Available Time Slots
                        </label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                          {TIME_SLOTS.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setSelectedTime(slot)}
                              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                                selectedTime === slot
                                  ? 'bg-teal-600 text-white shadow-md'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: Review & Confirm */}
                  {step === 4 && (
                    <div className="space-y-4">
                      <div className="p-5 rounded-2xl bg-teal-50/60 border border-teal-600/20 space-y-3">
                        <div className="flex items-center justify-between pb-3 border-b border-teal-600/10">
                          <span className="text-xs text-teal-800 font-semibold">Appointment Type</span>
                          <span className="text-sm font-bold text-slate-900">{selectedType.name}</span>
                        </div>
                        <div className="flex items-center justify-between pb-3 border-b border-teal-600/10">
                          <span className="text-xs text-teal-800 font-semibold">Practitioner</span>
                          <span className="text-sm font-bold text-slate-900">{selectedPractitioner?.name}</span>
                        </div>
                        <div className="flex items-center justify-between pb-3 border-b border-teal-600/10">
                          <span className="text-xs text-teal-800 font-semibold">Date & Time</span>
                          <span className="text-sm font-bold text-teal-800">{selectedDate} at {selectedTime}</span>
                        </div>
                        <div className="flex items-center justify-between pb-3 border-b border-teal-600/10">
                          <span className="text-xs text-teal-800 font-semibold">Duration</span>
                          <span className="text-sm font-bold text-slate-900">{selectedType.duration} minutes</span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-teal-800 font-bold uppercase">Estimated Fee</span>
                          <span className="text-base font-bold text-teal-700">${selectedType.fee}.00</span>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                        <ShieldCheck size={18} className="text-teal-600 shrink-0" />
                        <span>A booking confirmation will be sent to your registered contact number.</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Navigation Buttons */}
            {!bookingSuccess && (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                {step > 1 ? (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors"
                  >
                    <ChevronLeft size={16} /> Back
                  </button>
                ) : (
                  <div />
                )}

                {step < 4 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition-all"
                  >
                    Next Step <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={handleConfirmBooking}
                    disabled={bookingLoading}
                    className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {bookingLoading ? 'Confirming...' : 'Confirm & Book Appointment'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
