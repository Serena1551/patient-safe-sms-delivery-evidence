import { createHash } from "node:crypto";
import { z } from "zod";
import type { InfraiClient } from "./infrai_client.js";

export const appointmentNoticeSchema = z.object({
  appointmentId: z.string().min(1).max(80),
  patientRef: z.string().min(1).max(80),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  startsAt: z.string().datetime({ offset: true }),
  clinicName: z.string().min(1).max(80),
  callbackNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
}).strict();

export type AppointmentNotice = z.infer<typeof appointmentNoticeSchema>;

export function buildPatientSafeText(input: AppointmentNotice): string {
  const when = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(input.startsAt));
  return `${input.clinicName}: appointment reminder for ${when} UTC. Questions or changes: ${input.callbackNumber}. Do not reply with health information.`;
}

function privacyRef(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export async function sendAppointmentNotice(infrai: InfraiClient, input: AppointmentNotice) {
  const text = buildPatientSafeText(input);
  const submission = await infrai.sms.batch.send<{ id: string }>({
    messages: [{ to: input.phone, text }],
  }, `appointment:${input.appointmentId}`);

  await infrai.metrics.report({
    type: "counter",
    name: "appointment_sms.submitted",
    value: 1,
    tags: {
      appointment_ref: privacyRef(input.appointmentId),
      patient_ref: privacyRef(input.patientRef),
    },
  }, `appointment-metric:${input.appointmentId}`);

  return { deliveryId: submission.id, state: "submitted" as const };
}

export async function getDeliveryEvidence(infrai: InfraiClient, deliveryId: string) {
  const [events, metrics] = await Promise.all([
    infrai.sms.events<unknown>(deliveryId),
    infrai.metrics.query<unknown>(new URLSearchParams({
      name: "appointment_sms.submitted",
      agg: "sum",
    })),
  ]);
  return { deliveryId, events, metrics };
}
