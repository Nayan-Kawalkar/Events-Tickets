"use client";

export type ApiFailure = { message: string; fields: Record<string, string> };
export type ApiResult<T> = { ok: true; data: T } | ({ ok: false } & ApiFailure);

/** Small JSON fetch wrapper that normalises our API error envelope. */
export async function apiRequest<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again.", fields: {} };
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    return {
      ok: false,
      message: (data.message as string) ?? "Something went wrong. Please try again.",
      fields: (data.fields as Record<string, string>) ?? {},
    };
  }

  return { ok: true, data: data as T };
}
