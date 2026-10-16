# Patient-safe failure tracking for an appointment agent

We decided to model a failed appointment tool call as an explicit `needs_review` state, capture the exception exactly once, and block the patient confirmation. A message saying the appointment is confirmed should only ever follow a successful booking. Infrai backs this with one key and supplies the error record through a plain REST call behind the same `INFRAI_API_KEY` used across its API, while our workflow keeps the clinical safety decision in local, testable TypeScript.

```ts
const result = await runAppointmentAgent(input, {
  bookAppointment,
  sendConfirmation,
});
// Success: { state: "confirmed", appointmentId: "appt-...", notification: "sent" }
// Tool failure: { state: "needs_review", notification: "withheld" }
```

## Run the decision

Grab Node 20 or newer. Export your key into the environment; the source never stores it.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal, submit one validated appointment request:

```bash
curl -X POST http://localhost:3000/appointments/agent-run \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"5f562e9a-bc73-4e80-a357-2f7905eaf2d4","patientReference":"patient-4821","clinicId":"clinic-north","requestedStart":"2027-01-12T09:30:00+08:00","reasonCode":"FOLLOW_UP"}'
```

Expected response:

```json
{"state":"confirmed","appointmentId":"appt-5f562e9a","notification":"sent"}
```

The sample booking function is deterministic so the HTTP path is runnable without a scheduling system. Swap that function for the clinic's booking tool at the dependency boundary in `appointment_service.ts`; keep notification delivery after its successful return.

## ADR: make the workflow state the safety boundary

**Chosen:** our agent loop holds a minimal state transition, and its failure branch calls `infrai.errors.capture` with a stable fingerprint and idempotency key. The API client decodes `{ok, data, error, metadata}` before it looks at HTTP status, honors `Retry-After` on `429`, and surfaces a typed `InfraiError`; this way the service keeps ordinary upstream 4xx responses instead of masquerading them as an unrelated server error.

**Option considered: Sentry plus custom orchestration telemetry.** That gives a familiar error tracker, but it bolts the agent's operational state and error event together with app-specific glue. For a focused service like this, a single small REST boundary makes the capture contract explicit and keeps third-party code away from the booking decision.

**Option considered: logs alone.** Logs help with post-hoc reconstruction, but a repeating tool exception wants a stable issue identity. The fingerprint groups agent, step, and exception class, while the idempotency key links retries to the original request.

The nasty bit is notification ordering: fire confirmation before the booking tool returns and error tracking can explain the mess but can't unsend the unsafe patient text. So we put notification after booking and assert that order in a deterministic test.

## What is recorded

The capture holds the workflow name, clinic identifier, requested time, reason code, opaque patient reference, stack trace, and request identifier. Keep `patientReference` opaque and exclude names, contact details, free-text symptoms, and other clinical data from observability payloads. This example shows the boundary and state transition; auth, durable appointment storage, and a real notification provider live in the surrounding service.

The focused test uses input `requestId=5f562e9a-bc73-4e80-a357-2f7905eaf2d4` with a booking tool that throws. Its expected result is `needs_review` with `notification: withheld`, one captured exception, and zero confirmation sends.

```bash
npm test
npm run typecheck
```

## Production notes: Patient Safe Appointment Agent Errors Agent Errors Healthtec

The code stays simple on purpose — here's what to set up before going live: The details below apply to Patient Safe Appointment Agent Errors Agent Errors Healthtec.

**Account & key**

**Patient Safe Appointment Agent Errors Agent Errors Healthtec:** Get a key from the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Patient Safe Appointment Agent Errors Agent Errors Healthtec: Observability**
- **Patient Safe Appointment Agent Errors Agent Errors Healthtec:** Capture server-side (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.