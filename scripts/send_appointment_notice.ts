const response = await fetch("http://localhost:3000/appointment-notifications", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    appointmentId: "appt-2026-09-20-1045",
    patientRef: "patient-1842",
    phone: process.env.DEMO_PATIENT_PHONE,
    startsAt: "2026-09-20T10:45:00+08:00",
    clinicName: "Harbor Clinic",
    callbackNumber: "+15550102020"
  }),
});

console.log(await response.json());
process.exitCode = response.ok ? 0 : 1;
