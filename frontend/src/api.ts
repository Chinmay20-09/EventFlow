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

export interface ApiHealth {
  status: string
  environment: string
  max_simulation_attempts: number
}

export interface AuthSession {
  access_token: string
  token_type: string
  user: {
    user_id: number
    username: string
    role: string
    email: string | null
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  } catch {
    throw new Error('Cannot reach the EventFlow API. Make sure the backend is running.')
  }

  let body: ApiResponse<T>
  try {
    body = await response.json() as ApiResponse<T>
  } catch {
    throw new Error(`The EventFlow API returned an invalid response (${response.status}).`)
  }

  if (!response.ok || !body.success) {
    throw new Error(body.success ? `Request failed (${response.status}).` : body.error.message)
  }
  return body.data
}

export function getApiHealth(): Promise<ApiHealth> {
  return request<ApiHealth>('/api/health')
}

export function login(login: string, password: string): Promise<AuthSession> {
  return request<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  })
}
