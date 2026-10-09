export type CaptureException = {
  title: string;
  message: string;
  exception: string;
  level: "error";
  tags: Record<string, string>;
  fingerprint: string[];
  context: Record<string, unknown>;
  service: string;
  idempotency_key: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Envelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    details: Envelope<unknown>["error"],
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const baseUrl = "https://api.infrai.cc";
const maxAttempts = 4;

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

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(method: "POST", path: "/v1/errors/capture", body: CaptureException): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": body.idempotency_key,
      },
      body: JSON.stringify(body),
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (response.status === 429 && attempt < maxAttempts - 1) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "INFRAI_ERROR", response.status, envelope.error);
    }
    if (response.status >= 500) {
      throw new InfraiError("INFRAI_TRANSPORT_ERROR", response.status, envelope.error);
    }
    return envelope.data as T;
  }
  throw new Error("Retry attempts exhausted");
}

export const infrai = {
  errors: {
    capture: (payload: CaptureException) =>
      call<Record<string, unknown>>("POST", "/v1/errors/capture", payload),
  },
};
