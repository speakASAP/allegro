
# Integration Contract

## Purpose
The Allegro marketplace integration participates in the Alfares ecosystem by synchronizing offer data, stock state, and order forwarding without taking ownership of unrelated business domains.

## Capability decisions
The machine-readable decisions live in ips-adoption.json. The real production decisions are:

| Capability | Component | Decision | Contract/API/event | Configuration | Failure mode | Validation evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Auth | auth-microservice | required | shared auth boundary | service configuration and secret injection | fail closed with recorded error state | IPS validation and health checks |
| PostgreSQL | db-server-postgres | required | shared relational persistence | repository config and platform settings | data access failure is surfaced and logged | CI and runtime validation evidence |
| Redis | db-server-redis | not-applicable | none | none | not applicable | not applicable |
| Logging | logging-microservice | required | shared logging API | environment and service configuration | log sink failures are surfaced to operations | health and log validation |
| Notifications | notifications-microservice | required | service notification contract | alert configuration | notifications fail gracefully and are surfaced in logs | operational validation |
| AI | ai-microservice | not-applicable | none | none | not applicable | not applicable |
| Payments | payments-microservice | not-applicable | none | none | not applicable | not applicable |
| Catalog | catalog-microservice | required | product and offer validation services | catalog API configuration | validation failure blocks unsafe offer writes | service validation evidence |
| Orders | orders-microservice | required | order-forwarding boundary | order API configuration | order forwarding errors are surfaced and retried under the service contract | integration evidence |
| Warehouse | warehouse-microservice | required | stock.updated event consumption | RabbitMQ and stock sync configuration | inventory mismatch is flagged operationally | event validation |
| Invoices | invoices-microservice | not-applicable | none | none | not applicable | not applicable |
| Object storage | minio-microservice | not-applicable | none | none | not applicable | not applicable |
| Events | RabbitMQ | required | stock.updated consumption | event bus configuration | degraded mode preserves traceability | event validation evidence |
| Documentation retrieval | docs-rag-microservice | not-applicable | none | none | not applicable | not applicable |
| Monitoring | monitoring-microservice | required | GET /health and readiness probes | deployment config and health checks | rollout is blocked until health is restored | monitoring evidence |
| Backups | backups-microservice | not-applicable | none | none | not applicable | not applicable |

## Data ownership
The service keeps only the operational state required to manage Allegro offers and synchronization flows. Product master data remains owned by the catalog service, and order ownership remains with the orders domain.

## Authentication and authorization
The repository uses the platform auth model and shared service authentication boundaries. Marketplace credentials remain in secure secret storage, and runtime access is validated before any offer or stock action is executed.

## Synchronous dependencies
- catalog-microservice for product and offer validation
- auth-microservice for request and operator authentication
- orders-microservice for order forwarding and downstream processing
- database-server PostgreSQL for local runtime state

## Asynchronous dependencies
- RabbitMQ stock.updated events from the warehouse service
- operational notifications through notifications-microservice
- log output through logging-microservice

## Degraded operation
When catalog validation or stock event streams are unavailable, the service must fail closed with explicit operational evidence and avoid creating or mutating unsupported offers.

## Validation
Validation and health evidence come from the central IPS adoption gate, repo-local runtime checks, and service health/monitoring evidence. Any contract drift must be reconciled before deployment to the production marketplace environment.
