import { NextResponse } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";

export type ApiError = {
  error: string;
  message: string;
  fields?: Record<string, string>;
};

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(status: number, error: string, message: string, fields?: Record<string, string>) {
  return NextResponse.json<ApiError>({ error, message, ...(fields ? { fields } : {}) }, { status });
}

export const unauthorized = () => fail(401, "UNAUTHORIZED", "Please sign in to continue.");
export const forbidden = () => fail(403, "FORBIDDEN", "You do not have access to this resource.");
export const notFound = () => fail(404, "NOT_FOUND", "Not found.");
export const tooManyRequests = (retryAfter: number) =>
  NextResponse.json<ApiError>(
    { error: "RATE_LIMITED", message: `Too many attempts. Try again in ${retryAfter}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );

/** Flatten Zod issues into a { fieldPath: message } map for form display. */
export function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Parse a JSON request body against a schema. Schemas use `.strict()`, so
 * unexpected fields are rejected rather than silently ignored.
 */
export async function parseJson<T>(
  request: Request,
  // Input is `unknown` so schemas using .default()/.transform() — whose input and
  // output types differ — still infer T as the parsed output.
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail(400, "INVALID_JSON", "Request body must be valid JSON.") };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: fail(422, "VALIDATION_FAILED", "Please correct the highlighted fields.", fieldErrors(result.error)),
    };
  }
  return { ok: true, data: result.data };
}

/**
 * CSRF defence for cookie-authenticated writes: the request Origin must match
 * the Host it was sent to. Same-site cookies plus this check covers the
 * classic cross-site form POST.
 */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches may omit Origin
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** Log an unexpected error server-side and return an opaque message to the client. */
export function serverError(context: string, err: unknown) {
  console.error(`[api] ${context}`, err);
  return fail(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
}
