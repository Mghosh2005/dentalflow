# DentalFlow — Phase 1 Prototype

A working full-stack prototype of the DentalFlow practice management dashboard, built for Phase 1 (Foundation + Dashboard) of the development roadmap.

**Stack:** React (Vite) + Tailwind CSS frontend, Node.js (Express) + SQLite backend, wired together over a REST API — not mock/static data, this is a real client-server app.

---

## What's included

- **backend/** — Express API server backed by a SQLite database (`practices`, `patients`, `appointments`, `enquiries`, `follow_ups`, `alerts`, `practitioners`), pre-loaded with realistic sample data matching the practice "DentalFlow – Downtown."
- **frontend/** — React dashboard with the full navigation structure: Overview (Dashboard), Operations (Appointments, Patients, Inbox, Follow-ups), Management (Practitioners), and placeholders for AI Tools/Analytics (explicitly Phase 3, out of scope for now).

All dashboard numbers, alerts, appointments, and follow-ups are pulled live from the backend API — nothing on the frontend is hardcoded.

---

## How to run it (to demo to clients)

You need [Node.js](https://nodejs.org) (v18 or later) installed.

### 1. Start the backend
```bash
cd backend
npm install
npm run seed      # loads sample data into a local SQLite database
npm start         # starts the API on http://localhost:4000
```

### 2. Start the frontend (in a second terminal)
```bash
cd frontend
npm install
npm run dev        # starts the dashboard on http://localhost:5173
```

### 3. Open the app
Visit **http://localhost:5173** in your browser. The dashboard will load live data from the local backend.

---

## Resetting the demo data

To reset all data back to the original sample state at any time:
```bash
cd backend
npm run seed
```

---

## What's working in this build

- **Dashboard** — live stat cards (today's appointments, active patients, revenue protected, conversion rate, missed calls/appointments, pending follow-ups), all computed from real stored data
- **Daily briefing and suggested actions** — computed live from the database, not hardcoded
- **Alerts** — revenue below target, missed appointments, missed calls — dismissible, persisted in the database
- **Appointments** — book new appointments (patient, practitioner, date/time, reason), change status inline (booked/completed/missed/cancelled), delete
- **Patients** — add, edit, and delete patient records
- **Inbox** — log new enquiries (phone/web/walk-in), update status inline
- **Follow-ups** — add new follow-up items (hygiene recall, no-show rebooking, message approval, consult follow-up), mark as done
- **Practitioners** — directory view
- **Analytics** — real charts computed from stored appointment data: revenue by month, appointment status breakdown, revenue by practitioner, total patients/revenue/appointments

Every one of these writes to the actual SQLite database — refresh the page, restart the server, and the data is still there. This is a genuine full-stack app, not a static mockup.

## What's intentionally not included yet (later phases)

- AI voice receptionist / live call handling
- AI-generated call summaries and voice notes
- Third-party integrations (WhatsApp, calendar sync, billing)
- Production deployment/hosting (this runs locally for demo purposes)

These are called out directly in the sidebar as "Phase 3" so the scope boundary is visible in the product itself.
