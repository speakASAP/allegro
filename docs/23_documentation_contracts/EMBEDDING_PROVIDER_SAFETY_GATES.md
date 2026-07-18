# Embedding Provider Safety Gates

## Purpose

Embedding providers can transmit or persist repository text. IPS must require
explicit credential, environment and sensitive-data gates before any provider
outside the local deterministic implementation is enabled.

## Provider registry

Provider safety state is declared in
`../config/embedding_provider_gates.json`.

Each provider entry must declare:

- provider id;
- approval status;
- runtime environment;
- credential mode;
- external network behavior;
- allowed data classifications;
- human review requirement;
- data boundary document.

## Credential gate

Provider credentials must never be committed to IPS artifacts.

Allowed credential modes:

- `none`: provider does not require credentials.
- `env_reference`: provider reads credentials from named environment variables.
- `secret_manager_reference`: provider reads credentials from an approved secret
  manager reference.

The registry may store environment variable names or secret reference names, but
must not store credential values, API keys, access tokens, private keys,
passwords or session cookies.

## Environment gate

Allowed runtime environments:

- `local`: deterministic local provider with no external network.
- `controlled_external`: external provider allowed only after review.
- `offline`: provider runs without network access.

Any provider with `allows_external_network: true` must also have:

- `status: approved_external`;
- `human_review_required: true`;
- a data boundary document;
- a credential mode other than `none`.

## Dry-run provider gate

Dry-run providers validate provider contracts without transmitting repository
text. A provider entry with `dry_run: true` must:

- use `environment: offline`;
- use `credential_mode: none`;
- set `allows_external_network: false`;
- set `human_review_required: true`;
- produce candidate output from synthetic or baseline fixture expectations only.

Dry-run output must be marked as dry-run and must not be treated as production
retrieval quality evidence.

## Sensitive-data gate

Allowed data classifications are limited to:

- `none`;
- `synthetic`;
- `masked`.

Providers must not accept `sensitive` classification in the registry. Sensitive
or production-derived material requires a secure workflow outside IPS prompts,
fixtures, examples, reports and AI-agent context packages.

## Validation

Run the provider safety gate before enabling or changing an embedding provider:

```bash
python3 scripts/embedding_provider_gate.py --root .
```

The gate blocks missing provider registry files, unknown active providers,
credential-looking values, invalid environments, unapproved external providers
and sensitive data classification.
