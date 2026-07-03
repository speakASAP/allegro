# Orders Lifecycle UI Reliability Slice - Allegro

Vision -> Orders is the central lifecycle surface for customer and admin order visibility.
Goal Impact -> Allegro customer and admin order cabinets expose all central lifecycle stages with visible refresh state.
System -> Allegro frontend reads local Allegro orders enriched with central Orders read-model fields; Orders remains system of record.
Feature -> Customer and admin order pages show friendly lifecycle labels and manual plus polling refresh.
Task -> Add bounded UI reliability coverage for central lifecycle stages without printing customer payloads or order rows in validation.
Execution Plan -> Update only order cabinet pages plus a static source verifier, then run frontend build and verifier.
Coding Prompt -> Worker Frontend-B shared Alfares Orders reliability slice for Allegro, Bazos, and Aukro.
Code -> services/frontend/src/pages/OrdersPage.tsx, services/frontend/src/pages/BuyerOrdersPage.tsx, scripts/verify-orders-lifecycle-ui.js.
Validation -> node scripts/verify-orders-lifecycle-ui.js passed; cd services/frontend && npm run build passed.

Covered central lifecycle stages: ordered_unpaid, payment_failed, paid_not_delivered, warehouse_fulfillment_requested, warehouse_collecting, warehouse_forming, warehouse_formed, handed_to_delivery, in_delivery, received, not_received, returned, cancelled.

Sensitive-data boundary: validation reports aggregate source coverage only and does not print tokens, customers, order rows, tracking values, provider payloads, or DB rows.

[MISSING: runtime browser smoke after deploy]
[UNKNOWN: whether current production bundle already contains this source change before deploy]
