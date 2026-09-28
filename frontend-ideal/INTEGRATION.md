# Integration

This package runs on the local Node/Next.js server. It does not import Cloudflare at runtime.
See README.md for startup and key setup.

Google Maps browser key:
- GOOGLE_MAPS_API_KEY in .env.local (legacy .dev.vars supported).
- Served by GET /api/map-config with no cache.
- Only the browser key is returned; AI service tokens remain on the server.

Local endpoints:
- GET/POST /api/auth: user/session, signup (first account = owner, later signups pending), login, logout.
- GET/POST /api/admin: owner lists and approves/declines pending administrator accounts.
- GET/POST /api/event: selected event.
- GET /api/events/:eventId/graph: saved framing, nodes, edges, routes, updates, node options, websocket URL.
- POST /api/events/:eventId/location: {bounds:{north,south,east,west},zoom,center:{lat,lng}}.
- POST /api/events/:eventId/unlock: explicit administrator unlock.
- POST /api/events/:eventId/nodes: {external_id?,name,type,latitude,longitude,capacity,status}.
- PATCH /api/events/:eventId/nodes/:nodeId: changed node fields only.
- POST /api/events/:eventId/edges: {from,to}; forwards to the orchestrator.
- GET/POST /api/operations: event incidents and AI workflows.

All local changes are persisted in .eventflow-local/data.json on the server, not in browser storage.
Do not deploy this single-machine store as a multi-process production datastore.

The optional orchestrator is configured by ORCHESTRATOR_URL and ORCHESTRATOR_TOKEN.
It receives create_edge, analyze_incident, simulate_strategy, dispatch_approved_response,
response_status and map_snapshot actions. Existing payload shapes are preserved.
Use HTTPS remotely; localhost HTTP endpoints are accepted for backend development.
For create_edge, return geometry (GeoJSON LineString/MultiLineString) and distance.
Routes and congestion decisions must be computed there, never in frontend components.

EVENTFLOW_WS_URL supplies the websocket endpoint. The browser subscribes using:
{action:"subscribe",channel:"event:EVENT_ID:update"}
Updates: {channel:"event:EVENT_ID:update",data:{nodeId,visitorsNow,updatedRoutes,alertText}}
updatedRoutes contains backend-produced GeoJSON geometry. No browser route calculation occurs.
