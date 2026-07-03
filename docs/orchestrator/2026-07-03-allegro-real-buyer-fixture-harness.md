# Allegro Real Buyer Synthetic Fixture Harness

Date: 2026-07-03
Status: source-prepared, approval-gated

## IPS Chain

- Vision: real buyer cabinet smoke must prove Auth-subject ownership without authorizing by email or exposing production customer data.
- Goal Impact: if no natural subject-bound order exists, one clearly synthetic bound row can be created and cleaned up under explicit approval.
- System: Auth owns the subject; Allegro owns the buyer-safe order projection; Orders owns lifecycle state; Warehouse/provider lanes remain separate.
- Feature: approval-gated synthetic buyer fixture lifecycle.
- Task: add a script that defaults to no mutation and can create or clean up only prefixed synthetic Allegro rows after explicit confirmation.
- Execution Plan: use `allegro_orders.buyerAuthSubject` for ownership proof; insert one synthetic order and one synthetic line item; delete only rows whose external id starts with the guarded fixture prefix.
- Coding Prompt: no token output, no raw Auth subject output, no raw row id output, no production row mutation without explicit confirm.
- Code: `scripts/manage-allegro-real-buyer-fixture.js` and package script `fixture:real-buyer-cabinet`.
- Validation: node syntax check, default no-mutation script execution, and approved-mode missing-DB gate check. Runtime create/cleanup uses the host `psql` binary instead of a Node `pg` module.

## Default Mode

```bash
npm run fixture:real-buyer-cabinet
```

Expected result:

- `status=approval_required_no_db_mutation`
- no DB connection, live API call, deploy, provider call, Orders call, or production mutation.

## Runtime Dependency

Approved create/cleanup mode requires the host `psql` binary. The connection string is supplied through environment or file and passed through process environment, not printed by the script.

## Approved Create Mode

Required environment:

- `ALLEGRO_BUYER_FIXTURE_MODE=create`
- `ALLEGRO_BUYER_FIXTURE_CONFIRM=CREATE_SYNTHETIC_BUYER_FIXTURE`
- `ALLEGRO_BUYER_FIXTURE_DATABASE_URL` or `ALLEGRO_BUYER_FIXTURE_DATABASE_URL_FILE`
- `ALLEGRO_BUYER_FIXTURE_AUTH_SUBJECT` or `ALLEGRO_BUYER_FIXTURE_AUTH_SUBJECT_FILE`

The script creates:

- one `allegro_orders` row with external id prefix `codex-real-buyer-smoke-`;
- one `allegro_order_line_items` row;
- `buyerAuthSubject` set to the supplied Auth subject;
- synthetic buyer fields and synthetic rawData classification.

Output is limited to booleans and short hashes.

## Approved Cleanup Mode

Required environment:

- `ALLEGRO_BUYER_FIXTURE_MODE=cleanup`
- `ALLEGRO_BUYER_FIXTURE_CONFIRM=CLEANUP_SYNTHETIC_BUYER_FIXTURE`
- `ALLEGRO_BUYER_FIXTURE_DATABASE_URL` or `ALLEGRO_BUYER_FIXTURE_DATABASE_URL_FILE`

Cleanup deletes only rows whose `allegroOrderId` starts with `codex-real-buyer-smoke-`; line items cascade by relation.

## Remaining Gates

- `[MISSING: owner approval to create a synthetic subject-bound Allegro fixture row.]`
- `[MISSING: safe runtime database URL source and Auth subject file/env path for approved execution.]`
- `[MISSING: approved Auth-valid buyer bearer for the paired buyer smoke harness.]`
- `[MISSING: real forwarded Orders lifecycle display smoke if the synthetic row is not forwarded to central Orders.]`

Next step: approve fixture create plus guarded buyer smoke execution, then cleanup the synthetic row and record sanitized evidence.
