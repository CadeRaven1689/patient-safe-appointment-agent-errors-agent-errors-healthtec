import { z } from "zod";
import { infrai, type CaptureException } from "./infrai_errors.js";

export const appointmentRequestSchema = z.object({
  requestId: z.string().uuid(),
  patientReference: z.string().min(1).max(80),
  clinicId: z.string().min(1).max(80),
  requestedStart: z.string().datetime({ offset: true }),
  reasonCode: z.string().min(1).max(40),
});

export type AppointmentRequest = z.infer<typeof appointmentRequestSchema>;
export type AppointmentResult =
  | { state: "confirmed"; appointmentId: string; notification: "sent" }
  | { state: "needs_review"; notification: "withheld" };

type BookAppointment = (request: AppointmentRequest) => Promise<{ appointmentId: string }>;
type SendConfirmation = (patientReference: string, appointmentId: string) => Promise<void>;
type CaptureFailure = (payload: CaptureException) => Promise<unknown>;

export async function runAppointmentAgent(
  request: AppointmentRequest,
  dependencies: {
    bookAppointment: BookAppointment;
    sendConfirmation: SendConfirmation;
    captureFailure?: CaptureFailure;
  },
): Promise<AppointmentResult> {
  try {
    const booked = await dependencies.bookAppointment(request);
    await dependencies.sendConfirmation(request.patientReference, booked.appointmentId);
    return { state: "confirmed", appointmentId: booked.appointmentId, notification: "sent" };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("Unknown appointment workflow failure");
    const captureFailure = dependencies.captureFailure ?? infrai.errors.capture;
    await captureFailure({
      title: "Appointment agent tool step failed",
      message: error.message,
      exception: error.stack ?? `${error.name}: ${error.message}`,
      level: "error",
      tags: { workflow: "appointment-booking", clinic_id: request.clinicId },
      fingerprint: ["appointment-agent", "book-and-notify", error.name],
      context: {
        request_id: request.requestId,
        patient_reference: request.patientReference,
        requested_start: request.requestedStart,
        reason_code: request.reasonCode,
        notification: "withheld",
      },
      service: "appointment-agent",
      idempotency_key: `appointment-failure:${request.requestId}`,
    });
    return { state: "needs_review", notification: "withheld" };
  }
}
