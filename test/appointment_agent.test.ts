import assert from "node:assert/strict";
import test from "node:test";
import { runAppointmentAgent } from "../src/appointment_agent.js";

test("a booking failure is captured and never sends a patient confirmation", async () => {
  let notificationCount = 0;
  const captured: Array<Record<string, unknown>> = [];
  const requestId = "5f562e9a-bc73-4e80-a357-2f7905eaf2d4";

  const result = await runAppointmentAgent(
    {
      requestId,
      patientReference: "patient-4821",
      clinicId: "clinic-north",
      requestedStart: "2027-01-12T09:30:00+08:00",
      reasonCode: "FOLLOW_UP",
    },
    {
      bookAppointment: async () => {
        throw new Error("Scheduling tool rejected the slot");
      },
      sendConfirmation: async () => {
        notificationCount += 1;
      },
      captureFailure: async (payload) => {
        captured.push(payload);
      },
    },
  );

  assert.deepEqual(result, { state: "needs_review", notification: "withheld" });
  assert.equal(notificationCount, 0);
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.idempotency_key, `appointment-failure:${requestId}`);
  assert.deepEqual(captured[0]?.fingerprint, ["appointment-agent", "book-and-notify", "Error"]);
});
