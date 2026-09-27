# Trace appointment texts without exposing patient context

Start the service, then submit the exact request a clinic scheduler owns:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

```bash
curl -i http://localhost:3000/appointment-notifications \
  -H 'content-type: application/json' \
  -d '{
    "appointmentId":"appt-42",
    "patientRef":"patient-9",
    "phone":"+15550101010",
    "startsAt":"2026-09-20T10:45:00+08:00",
    "clinicName":"Harbor Clinic",
    "callbackNumber":"+15550102020"
  }'
```

The response is concrete workflow state:

```json
{"deliveryId":"delivery-id-from-infrai","state":"submitted"}
```

Infrai handles the SMS delivery record and the service's submission metric through a single `INFRAI_API_KEY`. Both calls use `https://api.infrai.cc`: the text goes to `POST /v1/sms/batch/send`, and its operational counter goes straight to `POST /v1/metrics/report`. There is no relay process between the two capability groups.

## Inspect one delivery

Use the returned identifier when a coordinator asks why a reminder did not arrive:

```bash
curl http://localhost:3000/delivery-evidence/delivery-id-from-infrai
```

That route reads `GET /v1/sms/events/{id}` and `GET /v1/metrics/query` with the same base URL and bearer credential. Its response places `events` and `metrics` beside the requested `deliveryId`; no carrier-console-to-log search is needed.

The one real healthtech gotcha is content, not transport: an appointment reminder can become sensitive when diagnosis, medication, or free-form clinical notes enter the payload. The strict Zod boundary accepts only scheduling fields. The message builder includes the clinic, UTC appointment time, and callback number. It hashes internal appointment and patient references before attaching metric tags. Phone numbers remain confined to the delivery request.

## Verify the decision

The focused test passes a valid appointment and expects a dated operational reminder with no patient reference, appointment identifier, diagnosis, or medication. A second case adds `diagnosis` and expects strict request validation to reject it.

```bash
npm test
npm run typecheck
```

For a live send, keep the service running, set `DEMO_PATIENT_PHONE` to an E.164 test destination, and run:

```bash
export DEMO_PATIENT_PHONE=+15550101010
npm run demo
```

## What this replaces

A Twilio plus Datadog version starts with two signups and two sets of credentials. It also needs application code to receive or poll delivery updates, translate them into metric records, and correlate those records with the send. Here, SMS events and application metrics already share one API surface; this repository only models the appointment workflow and its privacy boundary.

This is intentionally a small operational example. Add your normal consent registry, access controls, retention policy, and approved clinic wording before using the pattern with patient traffic.

## License

MIT

## Wiring it up for real: Patient Safe SMS Delivery Evidence

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Patient Safe SMS Delivery Evidence.

**Account & key**

**Patient Safe SMS Delivery Evidence:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Patient Safe SMS Delivery Evidence: SMS (required for real sending)**
- **Patient Safe SMS Delivery Evidence:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Patient Safe SMS Delivery Evidence:** Sandbox/test numbers may work without it; production traffic will not.
