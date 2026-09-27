# EventFlow: live planning and administrator access

## Accounts
Administrator login uses a case-insensitive user ID and password; signup also asks for user name. The public profile contains only userId, userName, role (administrator), and createdAt. Creation date and role are assigned server-side. No email or organization field is collected.

Passwords use PBKDF2-SHA256 with a per-account random salt and versioned iteration count. Raw passwords never enter storage or logs. Sessions use random 256-bit tokens with only SHA-256 token hashes stored in D1; cookies are Secure, HttpOnly, SameSite=Strict, and expire after 12 hours. Logout revokes the session. Mutations validate request origin. Login/signup use durable per-ID and, when available, edge-IP attempt limits. Invalid credentials use a generic response and a dummy hash for unknown users. Passwords require at least 12 characters. No reset flow is added.

OWNER_EMAIL remains a private runtime bootstrap setting: signup requests forwarded from the verified Site owner's hosted session may create an approved owner account. Other signups stay pending until an owner approves them. This bootstrap does not replace password login; /api/auth login authenticates only user ID and password and does not require ChatGPT identity headers. Site-level owner-private access remains unchanged and may independently require the hosting platform's sign-in. After owner approval, the new administrator logs in again. Legacy external-identity records remain inert and are not migrated into password accounts. Existing owners must create their new password account.

## Orchestrator configuration
Set ORCHESTRATOR_URL (HTTPS) and optional ORCHESTRATOR_TOKEN in hosted environment settings. API tokens remain server-side. No demo crowd counts, capacities, ETAs, routes or traffic statuses are supplied. Without the orchestrator, map search and location continue to work but route planning shows a connection message.

POST recommend_routes request:
{action:'recommend_routes',origin:[latitude,longitude],destination:[latitude,longitude],departureTime:ISO8601,mode:'driving',requestId:string}

Response:
{routes:[{id:string,label:string,duration:number,distance:number,geometry:{type:'LineString',coordinates:[[longitude,latitude],...]},reason:string,trafficStatus?:string,capacityStatus?:string,arrivalTime?:ISO8601,instructions?:string[],assignedEntrance?:string}],recommendedRouteId?:string,trafficAvailable:boolean,capacity?:{limit:number,current?:number}|null,forecast?:{upcomingVisitors:number,windowMinutes?:number}|null,message?:string,updatedAt:ISO8601}

Duration = seconds. Distance = metres. Return an empty routes array and a clear message when no capacity-safe route exists. The UI validates the response and rejects stale plans older than two minutes. It refreshes active routes every 30 seconds while visible, using the latest GPS fix when tracking is enabled; user may disable refresh. Old routes after a failed refresh are explicitly marked as previous data. Keep route IDs stable between refreshes. The session requestId helps a backend deduplicate repeated planning requests; it is not authentication or a reservation. The orchestrator must coordinate allocations, capacities and arrivals server-side. Do not make reservations merely on a read-only recommend_routes request. Route display alone does not reserve admission.

POST map_snapshot request (administrator only):
{action:'map_snapshot'}
Response:
{updatedAt:ISO8601,message?:string,places:[{id:string,name:string,visitors?:number|null,capacity?:number|null,upcomingVisitors?:number|null,status?:string}]}

Traffic must come from an actual licensed traffic source. Venue limits, observed occupancy and expected arrival data must come from the event backend. The app is not a deployed forecasting AI. The backend should rank safe candidate routes and provide plain-language reasons and assigned entrances. Do not manufacture live data with an LLM.

## Mapping
Leaflet and OpenStreetMap provide the map. Nominatim provides submit-only address search and reverse geocoding. Wikipedia geotagged photos within 1km appear as nearby photos with source links; no unrelated images substitute for unavailable photos. These public endpoints have availability/usage constraints; use contracted mapping services with caching and rate limits for production scale. Google-style layout does not mean Google map tiles: actual Google Maps and traffic require a configured licensed service.

Location starts only after a user clicks the location button. It requires HTTPS and browser permission. Manual addresses and coordinates remain available. Stop, manual entry, and unmount clear the location watcher. No location history is stored. Current coordinates are sent to the configured route service only for a requested or enabled automatic route refresh.

## Administrator-entered place information
The three travel-update fields are editable by authenticated, approved administrators. Select a destination before entering visitors expected, visitors now, and capacity. Save persists all three values per coordinate key (rounded to 5 decimal places) in D1. Blank, negative, fractional and excessive values are rejected; zero is valid. Other users can read saved values. These are explicitly labeled administrator-entered, not live AI measurements. Each subsequent recommend_routes request includes venueInputs: {expected,current,capacity,updatedAt,source:'administrator'} or null, loaded server-side from D1. Saving clears previous routes so the next plan uses the new inputs. The orchestrator must consider their timestamp and provenance; this app does not independently allocate visitors.

## Routing without a configured AI service
Successful login/signup now navigates to /. The API uses ORCHESTRATOR_URL when configured. Otherwise an internal route coordinator requests real routes from OSRM and evaluates the entered destination capacity. Results are labeled as road-network estimates, not AI forecasts or safety guarantees; crowd capacity checks apply to the destination, not individual roads. When TOMTOM_API_KEY is configured, traffic-aware TomTom routes and its transparent traffic-flow tiles are enabled. API keys stay server-side. TomTom failures fall back to explicitly labeled OSRM estimates. Provider availability, plan entitlements and regional traffic coverage may vary. Road closure/hazard safety is not certified. The Google Maps link is a separate user-opened directions link.

## Event operations
Sidebar routes: / (existing map), /sandbox, /updates, /reports. Approved administrators set event name and city through Event settings. City search uses geocoding; city photographs use the matching Wikipedia article thumbnail with a source link, when available. The sidebar photo is not an unrelated stock image. Choosing a different event name or city starts a new event history; previous records remain stored.

Event operations persist incident, analysis, simulation, approval and acknowledged delivery records in D1. No simulated percentages are embedded. Only approved administrators can read or write operations. Generating strategies/simulating requires ORCHESTRATOR_URL. analyze_incident receives event, incident and labeled administrator-entered venueInputs. Return {title,description,risk,minutesToOvercrowding?,baseline:[{label,before,after,unit?}],strategies:[{id,title,description,benefits:string[],recommended?}]}. simulate_strategy receives event, analysis and strategy; return {metrics:[{label,before,after,unit?}],crowdReduction?:number|null,residualRisk,constraintsPassed:boolean,constraints:string[],directives:[{group:'Transportation'|'Hospitality & Providers'|'Travelers',message,actions:string[],destination?:{lat,lon}}]}. Constraint failure blocks approval. Approval is local audit only and never means updates were sent. A separate explicit Send approved response action calls dispatch_approved_response with approvalId and idempotencyKey equal to the persisted approval ID. Provider must enforce idempotency. response_status checks delivery without sending. Both return {updates:[{group,status:'queued'|'sent'|'failed'|'live',message,updatedAt:ISO8601}]}. Only validated acknowledgements become delivery records. Reports export stored event history as JSON. AI connectivity and delivery failures remain visible, without fabricated metrics or success statuses.

## Event map phases (current frontend contract)

- Routes: `/live-map`, `/ai-sandbox`, `/updates`, `/reports`. Legacy `/` and `/sandbox` remain valid.
- `GET /api/event` selects the persistent event ID. No default geographic coordinates are embedded in the map frontend.
- `GET /api/events/:eventId/graph` returns `location`, `nodes`, `edges`, `routes`, `updates`, and `socketUrl`.
- `POST /api/events/:eventId/location`: `{bounds:{north,south,east,west},zoom,center:{lat,lng}}`. Server rejects replacing a locked location. `POST .../unlock` explicitly unlocks it. Both require approved administrator access. No screenshot or blob is involved.
- `POST .../nodes`: `{external_id?,name,type,latitude,longitude,capacity,status}`. Types: gate, venue, junction. Server validates bounds and saves data in D1 under the event ID.
- `POST .../edges`: `{from,to}`. The server requests `create_edge` from `ORCHESTRATOR_URL`; that backend must return `{geometry:{type:"LineString",coordinates:[[lng,lat],...]},distance:number}`. The frontend performs no distance or path calculation. Missing backend configuration produces an actionable error and does not save a fabricated edge.
- Set `EVENTFLOW_WS_URL` to the backend's browser-accessible secure WebSocket endpoint. The frontend sends `{action:"subscribe",channel:"event:<eventId>:update"}`. Authenticate/authorize subscriptions on that service; no server credentials are exposed to the browser.
- Push either `{channel,data:{nodeId,visitorsNow,updatedRoutes,alertText,updatedAt}}` or the data object on a dedicated subscribed connection. Each route is `{id,geometry:{type:"LineString",coordinates:[[lng,lat],...]},color?}`. Counts, decisions, and route geometry are authoritative backend values. Routes render with animated dashes and reduced-motion support.
- The shared live provider preserves pushes while navigating with the sidebar router and displays alerts in Updates. The backend should persist and replay event updates on reconnect. No localStorage, browser-generated metrics, Dijkstra, or congestion calculations are used.
- `EVENTFLOW_WS_URL` and the routing orchestrator are not configured in the current deployment. Connection remains disconnected; node/location persistence works independently. Edge generation and live routes require those services.

Map/Nodes/Routes share one Leaflet map. The lock effect depends on serialized event-location values, not fetched object identities or tab state. API refreshes therefore preserve the camera. Only an explicit unlocked location clears minZoom/maxBounds. Map zoom has no application maximum; OSM tiles overzoom from native level 19. Node writes accept capacity only; visitor counts remain backend-feed data and are absent from node forms/tooltips.

## Canonical node schema

Node options are supplied by the graph endpoint from the server: types `gate`, `venue`, `junction`; statuses `active`, `inactive`, `closed`; creation default `active`. Statuses were not previously defined by this backend; this revision establishes that list. Node POST returns the full canonical row. PATCH `/api/events/:eventId/nodes/:nodeId` accepts only changed writable fields. IDs, event_id, timestamps and visitor fields are rejected in request bodies. Latitude/longitude come from the pin.

D1 owns integer node_id and integer event_id generation. `event_keys` maps existing opaque event route keys to internal integer event IDs without changing event URLs. Migration 0004 preserves legacy node records and translates saved edge references. The frontend consumes only returned node_id values.
