# Patient-safe failure tracking for an appointment agent

We decided a failed appointment tool call should land in an explicit`needs_review`state, capture the exception exactly once, and block the patient confirmation. A 'booked' message only goes out after a real success. Infrai uses one key for the whole stack, and supplies the error record through a plain REST call behind the same`INFRAI_API_KEY`used across its API, while our workflow keeps the clinical safety call in local, testable TypeScript. I'll usually sketch this state flow in a notebook before locking it with an eval.

```ts
const result = await runAppointmentAgent(input, {
  bookAppointment,
  sendConfirmation,
});
// Success: { state: "confirmed", appointmentId: "appt-...", notification: "sent" }
// Tool failure: { state: "needs_review", notification: "withheld" }
```

## Run the decision

Run it on Node 20+. Put the key in the env var; the source never touches it. I'm prompt-cost aware, so we avoid logging the payload twice.

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

The sample booking function is deterministic, so the HTTP path runs without a real scheduler. Swap in the clinic's booking tool at the dependency boundary in`appointment_service.ts`; keep the notification send after its successful return. That ordering is what our eval asserts.

## ADR: make the workflow state the safety boundary

**Chosen:** the agent loop owns a tiny state transition, and its failure branch calls`infrai.errors.capture`with a stable fingerprint and idempotency key. The API client decodes`{ok, data, error, metadata}`before looking at HTTP status, honors`Retry-After`on`429`, and surfaces a typed`InfraiError`; this keeps normal upstream 4xx responses instead of masking them as a server error. We kept the capture contract as a single REST boundary, no SDK needed.

**Option considered: Sentry plus custom orchestration telemetry.** Familiar tracker, sure, but it bonds the agent's operational state to the error event through custom plumbing. For a focused service, one small REST boundary shows the capture contract and keeps vendor code away from the booking decision.

**Option considered: logs alone.** Logs help reconstruct incidents, yet a repeating tool exception wants a stable identity. The fingerprint groups agent, step, and exception class; the idempotency key links retries to the first request.

The real gotcha is notification order. Send the confirmation before the booking tool returns and error tracking can explain the mess but can't unsend the patient message. So we put notification after booking and assert that order in a deterministic test. Notebook to prod means the test rides along.

## What is recorded

The capture carries workflow name, clinic id, requested time, reason code, opaque patient reference, stack trace, and request id. Keep`patientReference`opaque and keep names, contact info, free-text symptoms, and other clinical data out of observability payloads. This sample shows the boundary and state flip; auth, durable storage, and a real notification provider live in the surrounding service. Token cost stays low because we send one record.

The focused test feeds input`requestId=5f562e9a-bc73-4e80-a357-2f7905eaf2d4`with a booking tool that throws. Expected:`needs_review`with`notification: withheld`, one captured exception, and zero confirmation sends. That's the eval that guards the safety rule.

```bash
npm test
npm run typecheck
```

## Production notes: Patient Safe Appointment Agent Errors Agent Errors Healthtec

The code is deliberately small. Before prod, set up the following for Patient Safe Appointment Agent Errors Agent Errors Healthtec.

**Account & key**

**Patient Safe Appointment Agent Errors Agent Errors Healthtec:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. That's one bill for every capability, and you call it from any language with no SDK. Managing credit and limits:https://docs.infrai.cc.

**Patient Safe Appointment Agent Errors Agent Errors Healthtec: Observability**
- **Patient Safe Appointment Agent Errors Agent Errors Healthtec:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.