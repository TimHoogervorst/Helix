const BASE_URL = "/api";

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  signal?: AbortSignal;
  responseType?: "json" | "text";
}

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`API error: ${status}`);
    this.status = status;
    this.data = data;
  }
}

/** Thrown when the fetch itself fails (network error, DNS, timeout, etc.). */
class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

// ── CSRF token helpers (Django expects X-CSRFToken on unsafe methods) ──────

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() ?? null;
  return null;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ── Request ────────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: customHeaders, responseType = "json", ...rest } = options;
  const method = (rest.method || "GET").toUpperCase();

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(customHeaders as Record<string, string>),
  };

  // Attach Django CSRF token for unsafe methods (same-origin only)
  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers,
      body: body ? (isFormData ? body as FormData : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    throw new NetworkError(
      err instanceof Error ? err.message : "Network request failed",
    );
  }

  // 401 / 403 — user session expired or not authenticated → silent redirect
  if (response.status === 401 || response.status === 403) {
    // Don't redirect if we're already on the login page
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(response.status, { detail: "Authentication required." });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(response.status, errorData);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  if (responseType === "text") return (await response.text()) as T;
  return response.json();
}

export function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "GET", signal });
}

/** Get a same-origin JSON payload as raw text when exact number tokens matter. */
export function getText(path: string, signal?: AbortSignal): Promise<string> {
  return request<string>(path, { method: "GET", signal, responseType: "text" });
}

export function post<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body,
    signal,
    headers: extraHeaders,
  });
}

/** Upload multipart content through the authenticated same-origin API client. */
export function upload<T>(path: string, file: File, signal?: AbortSignal): Promise<T> {
  const body = new FormData();
  body.append("file", file, file.name);
  return request<T>(path, { method: "POST", body, signal });
}

export function put<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body,
    signal,
    headers: extraHeaders,
  });
}

export function patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "PATCH", body, signal });
}

export function del<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "DELETE", signal });
}

export { ApiError, NetworkError };

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
