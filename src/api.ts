type ApiEnvelope<T> = {
	success: boolean
	data?: T
	error?: { code: string; message: string }
}

export type EventRecord = {
	event_id: number
	name: string
	status: string
	start_time: string | null
	end_time: string | null
}

export type ApiHealth = {
	status: string
	environment: string
	max_simulation_attempts: number
}

export type ZoneRecord = {
	node_id: number
	name: string
	type: string
	capacity: number
	current_crowd: number | null
	occupancy_pct: number | null
	above_threshold: boolean
	crowd_updated_at: string | null
}

export type DashboardData = {
	event: EventRecord
	stats: {
		live_visitors: number
		crowd_level_pct: number | null
		network_capacity_pct: number | null
		risk_level: string | null
		alert_count: number
	}
	zones: ZoneRecord[]
	execution: {
		strategy_set_id: number | null
		status: string
		started_at: string | null
		completed_at: string | null
	}
}

export type AlertRecord = {
	source: string
	ref_id: number
	title: string
	location: string | null
	level: string
	created_at: string
}

export type TimelineRecord = {
	source: string
	ref_id: number
	message: string
	type: "alert" | "warning" | "success"
	created_at: string
}

export type EventSettings = {
	event_id: number
	event_name: string
	max_capacity: number
	alert_threshold: number
	auto_ai_alerts: boolean
	updated_at: string | null
}

export type ForecastPoint = {
	horizon_seconds: number
	predicted_value: number
	predicted_occupancy_pct: number | null
	confidence: number | null
}

export type ForecastZone = {
	prediction_id: number
	node_id: number
	node_name: string
	capacity: number
	predicted_crowd: number
	predicted_occupancy_pct: number | null
	prediction_horizon: number
	confidence: number | null
	created_at: string
	forecast_points: ForecastPoint[]
}

export type Recommendation = {
	event_id: number
	headline: string
	detail: string
	source: string
}

export type StrategySet = {
	strategy_set_id: number
	event_id: number
	status: string
	attempt_count: number
	simulation_result_id: number | null
	approval_status: string | null
	failure_reason: string | null
	name: string | null
	description: string | null
	risk_level: string | null
	created_at: string
	strategies: Array<{
		strategy_id: number
		source_node_id: number
		destination_node_id: number
		action: string
		status: string
	}>
}

export type SimulationResult = {
	simulation_result_id: number
	strategy_set_id: number
	status: string
	result_summary: string
	conflicts: unknown[]
	predicted_metrics: Record<string, unknown> | null
	p1_result: Record<string, unknown> | null
	created_at: string
}

export type StrategySetCreate = {
	strategies: Array<{
		source_node_id: number
		destination_node_id: number
		action: string
	}>
	name?: string
	description?: string
	risk_level?: string
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "")
let currentUserId = import.meta.env.VITE_P3_USER_ID?.trim()

export function setApiUserId(userId: string): void {
	currentUserId = userId.trim() || undefined
}

async function request<T>(
	path: string,
	options: RequestInit & { authenticated?: boolean } = {},
): Promise<T> {
	const { authenticated = false, ...init } = options
	const headers = new Headers(init.headers)
	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json")
	}
	if (authenticated) {
		if (!currentUserId) {
			throw new Error("Set VITE_P3_USER_ID to the backend user ID before this action.")
		}
		headers.set("X-User-Id", currentUserId)
	}

	let response: Response
	try {
		response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers })
	} catch {
		throw new Error("Cannot reach the EventFlow API. Start the backend on port 8000 and try again.")
	}

	let envelope: ApiEnvelope<T>
	try {
		envelope = (await response.json()) as ApiEnvelope<T>
	} catch {
		throw new Error(`The EventFlow API returned an invalid response (${response.status}).`)
	}

	if (!response.ok || !envelope.success || envelope.data === undefined) {
		throw new Error(envelope.error?.message ?? `EventFlow API request failed (${response.status}).`)
	}
	return envelope.data
}

function jsonBody(value: unknown): string {
	return JSON.stringify(value)
}

export const eventApi = {
	getHealth: () => request<ApiHealth>("/api/health"),
	listEvents: () => request<EventRecord[]>("/api/events"),
	createEvent: (payload: { name: string; start_time: string; end_time: string }) =>
		request<EventRecord>("/api/events", { method: "POST", body: jsonBody(payload) }),
	createNode: (
		eventId: number,
		payload: { name: string; type: string; capacity: number; status: string },
	) => request<{ node_id: number }>(`/api/events/${eventId}/nodes`, { method: "POST", body: jsonBody(payload) }),
	getDashboard: (eventId: number) => request<DashboardData>(`/api/events/${eventId}/dashboard`),
	getZones: (eventId: number) => request<ZoneRecord[]>(`/api/events/${eventId}/zones`),
	getAlerts: (eventId: number) => request<AlertRecord[]>(`/api/events/${eventId}/alerts`),
	getTimeline: (eventId: number) => request<TimelineRecord[]>(`/api/events/${eventId}/timeline`),
	getForecast: (eventId: number) =>
		request<{ event_id: number; zones: ForecastZone[] }>(`/api/events/${eventId}/predictions/forecast`),
	getRecommendation: (eventId: number) =>
		request<Recommendation>(`/api/events/${eventId}/recommendation`),
	getSettings: (eventId: number) => request<EventSettings>(`/api/events/${eventId}/settings`),
	updateSettings: (eventId: number, payload: Partial<Pick<EventSettings,
		"event_name" | "max_capacity" | "alert_threshold" | "auto_ai_alerts"
	>>) => request<EventSettings>(`/api/events/${eventId}/settings`, {
		method: "PUT",
		body: jsonBody(payload),
		authenticated: true,
	}),
	getStrategySets: (eventId: number) => request<StrategySet[]>(`/api/events/${eventId}/strategy-sets`),
	createStrategySet: (eventId: number, payload: StrategySetCreate) =>
		request<StrategySet>(`/api/events/${eventId}/strategy-sets`, { method: "POST", body: jsonBody(payload) }),
	simulateStrategySet: (strategySetId: number) =>
		request<{ strategy_set_id: number; simulation_result_id: number; status: string }>(
			`/api/strategy-sets/${strategySetId}/simulate`,
			{ method: "POST", body: "{}" },
		),
	getSimulation: (strategySetId: number) =>
		request<SimulationResult>(`/api/strategy-sets/${strategySetId}/simulation`),
	approveStrategySet: (strategySetId: number) =>
		request<{ strategy_set_id: number; status: string; execution_triggered: boolean }>(
			`/api/strategy-sets/${strategySetId}/approve`,
			{ method: "POST", body: "{}", authenticated: true },
		),
}
