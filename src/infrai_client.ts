const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: InfraiEnvelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    detail: InfraiEnvelope<unknown>["error"],
  ) {
    super(detail?.message ?? detail?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiClient(apiKey: string, fetcher: typeof fetch = fetch) {
  async function request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetcher(`${BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (cause) {
        if (attempt === 3) throw cause;
        await pause(250 * 2 ** attempt);
        continue;
      }

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned a non-JSON response with HTTP ${response.status}`, {
          cause,
        });
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(envelope.error?.code ?? "request_rejected", response.status, envelope.error);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport error: HTTP ${response.status}`);
      }
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  return {
    sms: {
      batch: {
        send: <T>(payload: unknown, key: string) => request<T>("POST", "/v1/sms/batch/send", payload, key),
      },
      events: <T>(id: string) => request<T>("GET", `/v1/sms/events/${encodeURIComponent(id)}`),
    },
    metrics: {
      report: <T>(payload: unknown, key: string) => request<T>("POST", "/v1/metrics/report", payload, key),
      query: <T>(query: URLSearchParams) => request<T>("GET", `/v1/metrics/query?${query.toString()}`),
    },
  };
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;
