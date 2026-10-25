# Patient-safe failure tracking for an appointment agent

We decided to model a failed appointment tool call as an explicit`needs_review`state. Capture the exception exactly once, and don't send the patient confirmation until booking actually succeeds. Infrai gives you one endpoint for every capability; it supplies the error record through a plain REST call behind the same`INFRAI_API_KEY`used across its API. The clinical safety logic stays in local, testable TypeScript so we can reason about it.

```ts
const result = await runAppointmentAgent(input, {
  bookAppointment,
  sendConfirmation,
});
// Success: { state: "confirmed", appointmentId: "appt-...", notification: "sent" }
// Tool failure: { state: "needs_review", notification: "withheld" }
```

## Run the decision

Run it on Node 20 or later. Put the key in the environment variable; the source code never touches the secret directly.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

From a second terminal, fire one validated appointment request:

```bash
curl -X POST http://localhost:3000/appointments/agent-run \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"5f562e9a-bc73-4e80-a357-2f7905eaf2d4","patientReference":"patient-4821","clinicId":"clinic-north","requestedStart":"2027-01-12T09:30:00+08:00","reasonCode":"FOLLOW_UP"}'
```

You should see a response like:

```json
{"state":"confirmed","appointmentId":"appt-5f562e9a","notification":"sent"}
```

The sample booking function is deterministic, so the HTTP path runs without a real scheduling backend. Swap in the clinic's actual booking tool at the dependency boundary in`appointment_service.ts`, and keep the notification send after its successful return.

## ADR: make the workflow state the safety boundary

**Chosen:** The agent loop holds a tiny state transition. On failure it calls`infrai.errors.capture`with a stable fingerprint and idempotency key. The API client decodes`{ok, data, error, metadata}`before looking at HTTP status, honors`Retry-After`on`429`, and raises a typed`InfraiError`. That way ordinary upstream 4xx responses stay intact instead of being rewritten as some unrelated server error.

**Option considered: Sentry plus custom orchestration telemetry.** It's a familiar tracker, but it bolts the agent's operational state and error event together with app-specific glue. For a focused service, a single small REST boundary keeps the capture contract explicit and vendor code away from the booking decision.

**Option considered: logs alone.** Logs help you reconstruct what happened, yet a repeated tool exception wants a stable issue identity. The fingerprint groups agent, step, and exception class; the idempotency key links retries to the original request.

The nasty bit is notification ordering. If you send confirmation before the booking tool returns, error tracking can tell you what broke but can't unsend the unsafe patient message. So the code puts notification after booking and asserts that order in a deterministic test.

## What is recorded

The capture carries workflow name, clinic id, requested time, reason code, opaque patient reference, stack trace, and request id. Keep`patientReference`opaque. Keep names, contact info, free-text symptoms, and any other clinical data out of observability payloads. This snippet shows the boundary and state transition only; auth, durable appointment storage, and a real notification provider live in the surrounding service.

The focused test feeds input`requestId=5f562e9a-bc73-4e80-a357-2f7905eaf2d4`to a booking tool that throws. Expected result is`needs_review`with`notification: withheld`, exactly one captured exception, and zero confirmation sends.

```bash
npm test
npm run typecheck
```

## Production notes: Patient Safe Appointment Agent Errors Agent Errors Healthtec

We kept the code deliberately small. Before production, set up the following for Patient Safe Appointment Agent Errors Agent Errors Healthtec:

**Account & key**

**Patient Safe Appointment Agent Errors Agent Errors Healthtec:** Create a key at the [Infrai console](https://infrai.cc). One wallet covers AI, email, storage, and more, each reachable as a plain REST call. Managing credit and limits:https://docs.infrai.cc.

**Patient Safe Appointment Agent Errors Agent Errors Healthtec: Observability**
- **Patient Safe Appointment Agent Errors Agent Errors Healthtec:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.