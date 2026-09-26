# EV-023 — Security

## 1. Document Purpose

This document defines MVP authentication/authorization expectations from the P3 perspective.

It answers:

> Who may view, approve, reject, and access operational functionality?

## 2. MVP User Types

The MVP has exactly three user types:

1. **Organizer**
2. **Coordinator**
3. **Visitor**

No separate `User` or `Customer` role is required for the MVP.

## 3. Role Summary

| Role        |                     Authentication | Approve | Reject |     Operational Execution |
| ----------- | ---------------------------------: | ------: | -----: | ------------------------: |
| Organizer   |                                Yes |      No |     No |                        No |
| Coordinator |                                Yes |     Yes |    Yes | Through approved workflow |
| Visitor     | No separate login required for MVP |      No |     No |                        No |

The exact frontend visibility rules can be defined by P4 according to the agreed UI behavior.

Visitor must remain read-only/public and must not receive operational privileges.

## 4. Authentication

Organizer and Coordinator are authenticated MVP users.

P3 receives the authenticated identity and role from the MVP authentication mechanism.

The P3 implementation must not trust a client-provided string such as:

```json
{
  "approved_by": "Coordinator"
}
```

as proof of identity.

The authenticated account determines who performed the action.

## 5. Coordinator Authority

Only an authenticated Coordinator can:

* approve a Strategy Set;
* reject a Strategy Set.

Approval is allowed only when the Strategy Set is in the appropriate simulated state.

After explicit approval, the system automatically triggers the execution workflow.

The Coordinator does not need a second manual Execute action.

## 6. Organizer Authority

Organizer is an authenticated MVP role.

Organizer may access the event/operational information permitted by the P4 frontend and MVP requirements.

Organizer does not have Coordinator approval or rejection authority.

## 7. Visitor Access

Visitor is a public/read-only role for the agreed visitor-facing functionality.

Visitor must not be able to:

* approve;
* reject;
* trigger execution;
* directly modify operational state;
* access protected operational actions.

## 8. Approval Record

Conceptually:

```text
Approval
├── approval_id
├── strategy_set_id
├── decision
├── approved_by → authenticated Coordinator
├── created_at
└── reason (optional)
```

This provides an audit trail.

## 9. Execution Authorization

There is no separate user-facing execution authorization action in the locked MVP workflow.

The execution workflow is triggered automatically only after a successful explicit Coordinator approval.

The backend must verify the Coordinator authorization before allowing approval.

## 10. Read Access

P3 should apply role checks to protected data according to the application's intended user flows.

The exact read permissions for every domain screen are not fully specified in this document.

The critical MVP security rule is that Visitor cannot perform operational actions and Organizer cannot approve/reject unless a future requirement explicitly changes the role model.

## 11. Internal P1/P2 APIs

For the MVP, a separate internal authentication mechanism for P1/P2-to-P3 APIs is not required.

However:

* request schemas must be validated;
* IDs must be validated;
* invalid data must be rejected;
* internal endpoints must not be treated as user-facing approval endpoints.

## 12. No Generic State Manipulation

A user must not be able to bypass authorization by directly updating a Strategy Set state.

For example:

```text
PATCH /api/strategy-sets/801
{
  "status": "APPROVED"
}
```

is not the workflow mechanism.

Approval must go through the controlled endpoint.

## 13. Audit Information

P3 should record:

* authenticated user identity;
* action;
* Strategy Set;
* timestamp;
* resulting workflow state.

For execution, the execution record also stores start/end/failure information.

## 14. MVP Security Boundary

The MVP does not require:

* enterprise SSO;
* multi-tenant authorization;
* enterprise identity providers;
* complex RBAC hierarchies;
* distributed authorization services;
* advanced API gateway security;
* enterprise security architecture.

These concerns belong to EV-044.

## 15. Security Failure Example

If a Visitor attempts:

```text
POST /api/strategy-sets/801/approve
```

P3 should reject the request as unauthorized/forbidden.

The frontend alone must not be the only security control.

## 16. Related Documents

* EV-016 — API
* EV-022 — Execution Model
* EV-024 — Error Handling
* EV-044 — Enterprise Security Architecture
