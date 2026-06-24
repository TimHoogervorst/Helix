const BASE_URL = "/api";

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(customHeaders as Record<string, string>),
  };

  const token = localStorage.getItem("auth_token");
  if (token) {
    headers["Authorization"] = `Token ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    localStorage.removeItem("auth_token");
    // Only redirect if not already on login-related pages
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, { detail: "Authentication required" });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(response.status, errorData);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body });
}

export function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body });
}

export function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export { ApiError };
