# Allegro Delivered Shipment Evidence Reconciliation

Date: 2026-07-03

## Result

Orders/Warehouse evidence now proves the pre-customer non-UNKNOWN shipment movement path through an approved sanitized `DELIVERED` fixture. The evidence is aggregate/redacted only: Warehouse status observations include `DELIVERED -> delivered -> accepted: 1`, `IN_TRANSIT -> in_delivery -> accepted: 1`, and `UNKNOWN -> noop -> accepted: 1`; Orders aggregate status includes one `delivered` order and zero persisted `shipments` rows.

This reconciliation did not perform provider writes, deployments, migrations, runtime consumer creation, webhook contract creation, credential creation, raw tracking reveal, raw provider payload output, customer PII output, raw account/order id output, screenshot capture, raw DOM output, or token output.

## IPS Chain

Vision -> provider/courier shipment status owns reliable lifecycle movement without exposing provider secrets.
Goal Impact -> the pre-customer non-UNKNOWN gate is closed by approved sanitized fixture evidence while real customer-provider proof remains optional future evidence.
System -> Allegro owns redacted provider snapshot production and Warehouse token projection; Warehouse owns correlation/status ledger and fulfillment transitions; Orders owns lifecycle projection.
Feature -> provider/courier shipment-status ownership gate.
Task -> reconcile Allegro status with Orders/Warehouse delivered evidence.
Execution Plan -> docs-only update after source/runtime/readback verification.
Coding Prompt -> do not create simulators, credentials, webhook contracts, DB migrations, runtime consumers, or raw tracking output.
Code -> docs only.
Validation -> Allegro shipment verifier suite passed; runtime deployments were ready; aggregate Warehouse/Orders readback showed delivered evidence.

## Evidence

- Allegro runtime: `localhost:5000/allegro-service:b6cd31a`.
- Warehouse runtime: `localhost:5000/warehouse-microservice:d9ebb47`.
- Orders runtime: `localhost:5000/orders-microservice:ad83d15`.
- Warehouse provider observations by class: `DELIVERED -> delivered -> accepted: 1`, `IN_TRANSIT -> in_delivery -> accepted: 1`, `UNKNOWN -> noop -> accepted: 1`.
- Warehouse fulfillment status aggregates: `delivered: 1`, `collecting: 1`, `requested: 5`.
- Orders aggregate status includes `delivered: 1`; Orders `shipments` table remains `0`.

## Remaining Gates

- [MISSING: service-native approved live scan path that can use Allegro OAuth without moving encrypted token material through temporary files.]
- [MISSING: future real Allegro.cz customer-provider sample with carrier tracking status other than UNKNOWN if product requires production-data evidence beyond approved fixture.]
- [MISSING: future audited full-tracking reveal contract if product/security approves raw tracking visibility.]

## Next Required Work

По-русски: дальше потребуется не новый симулятор и не ручная работа с токенами, а безопасный service-native путь внутри `allegro-service`: endpoint/job/command должен сам выбирать разрешённый заказ и читать OAuth через существующий сервис, возвращая только агрегаты и redacted status classes. Если нужен именно production-data proof, владелец Allegro аккаунта должен обеспечить реальное отправление с carrier tracking event или переавторизовать аккаунт, где такие события доступны.
