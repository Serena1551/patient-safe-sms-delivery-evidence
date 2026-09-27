import { createServer } from "node:http";
import { ZodError } from "zod";
import { appointmentNoticeSchema, getDeliveryEvidence, sendAppointmentNotice } from "./appointment_notice.js";
import { createInfraiClient, InfraiError } from "./infrai_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const infrai = createInfraiClient(apiKey);

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/appointment-notifications") {
      const input = appointmentNoticeSchema.parse(await readJson(request));
      return json(response, 202, await sendAppointmentNotice(infrai, input));
    }
    const match = request.url?.match(/^\/delivery-evidence\/([^/?]+)$/);
    if (request.method === "GET" && match) {
      return json(response, 200, await getDeliveryEvidence(infrai, decodeURIComponent(match[1])));
    }
    return json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof SyntaxError) return json(response, 400, { error: "invalid_json" });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    console.error(error);
    return json(response, 500, { error: "internal_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`appointment notification service listening on http://localhost:${port}`));
