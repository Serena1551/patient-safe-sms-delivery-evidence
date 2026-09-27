import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentNoticeSchema,
  buildPatientSafeText,
  getDeliveryEvidence,
} from "../src/appointment_notice.js";
import type { InfraiClient } from "../src/infrai_client.js";

test("builds an operational reminder without clinical data", () => {
  const input = appointmentNoticeSchema.parse({
    appointmentId: "appt-42",
    patientRef: "patient-9",
    phone: "+15550101010",
    startsAt: "2026-09-20T10:45:00+08:00",
    clinicName: "Harbor Clinic",
    callbackNumber: "+15550102020",
  });

  const text = buildPatientSafeText(input);
  assert.match(text, /Harbor Clinic/);
  assert.match(text, /Sep 20, 2026/);
  assert.match(text, /Do not reply with health information/);
  assert.doesNotMatch(text, /patient-9|appt-42|diagnosis|medication/i);
});

test("rejects clinical fields at the request boundary", () => {
  const result = appointmentNoticeSchema.safeParse({
    appointmentId: "appt-42",
    patientRef: "patient-9",
    phone: "+15550101010",
    startsAt: "2026-09-20T10:45:00+08:00",
    clinicName: "Harbor Clinic",
    callbackNumber: "+15550102020",
    diagnosis: "private clinical detail",
  });
  assert.equal(result.success, false);
});

test("queries delivery metrics with the required aggregation", async () => {
  let metricsQuery: URLSearchParams | undefined;
  const infrai = {
    sms: {
      events: async () => [],
    },
    metrics: {
      query: async (query: URLSearchParams) => {
        metricsQuery = query;
        return [];
      },
    },
  } as unknown as InfraiClient;

  await getDeliveryEvidence(infrai, "delivery-42");

  assert.equal(metricsQuery?.get("name"), "appointment_sms.submitted");
  assert.equal(metricsQuery?.get("agg"), "sum");
});
