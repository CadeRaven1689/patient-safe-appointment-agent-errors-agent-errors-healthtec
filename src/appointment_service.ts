import { createServer } from "node:http";
import { ZodError } from "zod";
import { appointmentRequestSchema, runAppointmentAgent } from "./appointment_agent.js";
import { InfraiError } from "./infrai_errors.js";

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/appointments/agent-run") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const input = appointmentRequestSchema.parse(await readJson(request));
    const result = await runAppointmentAgent(input, {
      bookAppointment: async ({ requestId }) => ({ appointmentId: `appt-${requestId.slice(0, 8)}` }),
      sendConfirmation: async () => undefined,
    });
    response.writeHead(result.state === "confirmed" ? 200 : 202).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid appointment request" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code }));
      return;
    }
    response.writeHead(500).end(JSON.stringify({ error: "Appointment workflow failed" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Appointment agent listening on http://localhost:${port}`));
