/**
 * Frontend API helpers for P3. Local development uses Vite's /api proxy;
 * VITE_P3_BASE_URL can point the frontend at a separately hosted backend.
 */

const configuredBaseUrl = import.meta.env.VITE_P3_BASE_URL as string | undefined
const P3_BASE_URL = (configuredBaseUrl
  ?? (import.meta.env.MODE === "test" ? "http://localhost:8000" : "")).replace(/\/+$/, "")

interface ApiSuccess<T> {
  success: true
  data: T
}

interface ApiFailure {
  success: false
  error: {
    code: string
    message: string
  }
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = "ApiError"
  }
}

export interface ApiHealth {
  status: string
  environment: string
  max_simulation_attempts: number
}

export interface AuthUser {
  user_id: number
  username: string
  role: string
  email: string | null
}

export interface AuthSession {
  access_token: string
  token_type: string
  user: AuthUser
}

export interface StoredEvent {
  event_id: number
  name: string
  start_time: string | null
  end_time: string | null
  status: string
}

let accessToken: string | null = null

export function clearAccessToken(): void {
  accessToken = null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`)
  }

  let response: Response
  try {
    response = await fetch(`${P3_BASE_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError("NETWORK_ERROR", "Cannot reach the EventFlow backend. Is it running?")
  }

  let body: ApiResponse<T>
  try {
    body = await response.json() as ApiResponse<T>
  } catch {
    throw new ApiError("INVALID_RESPONSE", `The EventFlow API returned an invalid response (${response.status}).`)
  }

  if (!response.ok || !body.success) {
    if (!body.success) {
      throw new ApiError(body.error.code, body.error.message)
    }
    throw new ApiError("HTTP_ERROR", `Request failed (${response.status}).`)
  }
  return body.data
}

export function getApiHealth(): Promise<ApiHealth> {
  return request<ApiHealth>("/api/health")
}

export async function login(login: string, password: string): Promise<AuthSession> {
  const session = await request<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  })
  accessToken = session.access_token
  return session
}

export function registerOrganizer(input: {
  username: string
  email: string
  password: string
}): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...input, role: "ORGANIZER" }),
  })
}

export function createCustomEvent(input: {
  name: string
  start_time: string
  end_time: string
}): Promise<StoredEvent> {
  return request<StoredEvent>("/api/events", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getStoredEvent(eventId: number): Promise<StoredEvent> {
  return request<StoredEvent>(`/api/events/${eventId}`)
}
