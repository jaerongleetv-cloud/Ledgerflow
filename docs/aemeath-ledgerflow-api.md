# Aemeath P9C LedgerFlow Read API

## Endpoint

```text
GET /api/integrations/aemeath/p9c/ledgerflow/v1/transactions
```

Query parameters:

- `limit`: optional integer from 1 through 500; default 500
- `cursor`: optional opaque cursor returned by an earlier response

LedgerFlow exposes no POST, PUT, PATCH, or DELETE transaction endpoint under this integration path.

## Authentication

Send the dedicated integration token in every request:

```http
Authorization: Bearer <integration-token>
```

Tokens belong to one LedgerFlow user and have the exact scope `aemeath:ledgerflow:transactions:read`. PostgreSQL stores only a SHA-256 hash. A token can have an expiration and can be revoked. Plaintext is displayed only by the creation command and is never returned by the API.

The endpoint uses the server-only Supabase service role to resolve the hash, then passes only the resolved token owner to the fixed `aemeath_fetch_transactions` RPC. It never accepts a `user_id` from the request and does not expose arbitrary database access.

## Create and revoke a token

Configure `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Apply all migrations, then run:

```powershell
npm.cmd run aemeath:token:create -- --email owner@example.com --name "Aemeath P9C"
```

An optional expiration is accepted as an ISO-8601 timestamp:

```powershell
npm.cmd run aemeath:token:create -- --user-id <user-uuid> --expires-at 2027-01-01T00:00:00Z
```

Store the displayed `lf_aem_...` value in Aemeath immediately. LedgerFlow stores no recoverable copy. Revoke it using the non-secret token id returned at creation:

```powershell
npm.cmd run aemeath:token:revoke -- --token-id <token-uuid>
```

## Response

```json
{
  "transactions": [
    {
      "external_id": "lf_tx_<stable-sha256-id>",
      "account_id": "11111111-1111-4111-8111-111111111111",
      "occurred_at": "2026-09-02T00:00:00.000Z",
      "description": "Coffee",
      "amount": "-12.3400",
      "currency": "CAD",
      "category": "Food",
      "transaction_type": "debit",
      "state": "posted"
    }
  ],
  "next_cursor": "<opaque-value>"
}
```

An empty initial feed returns `transactions: []` and `next_cursor: null`. An empty resumed feed returns the supplied high-water cursor unchanged so the next synchronization does not restart from the beginning.

## Field mapping

| Aemeath field | LedgerFlow source and rule |
| --- | --- |
| `external_id` | Stable SHA-256 identifier derived from the Supabase project host and `transactions.id` |
| `account_id` | Canonical `transactions.account_id`; missing values fail closed |
| `occurred_at` | `transaction_date`, then legacy `date`, then `created_at::date`; LedgerFlow stores day precision, represented as UTC midnight |
| `description` | `description`, then category, then `LedgerFlow transaction`; trimmed and limited to 1000 characters |
| `amount` | PostgreSQL `numeric::text`, signed according to the rules below |
| `currency` | `accounts.currency` for `transactions.account_id`, uppercased and validated as three letters |
| `category` | Existing transaction category or `null` |
| `transaction_type` | Deterministic mapping described below |
| `state` | `posted`; LedgerFlow has no pending transaction state |

### Amount and sign convention

LedgerFlow stores transaction magnitudes as positive PostgreSQL numeric values. The API returns exact decimal strings without converting them through JavaScript floating point.

- `expense`: negative amount, `transaction_type: debit`
- `savings`: negative amount, `transaction_type: debit`
- `income`: positive amount, `transaction_type: credit`
- `expense_refund`: positive amount, `transaction_type: credit`
- unknown legacy type: stored sign, `transaction_type: other`

`account_id` is the source/payment account already selected on the LedgerFlow transaction. For income it is the receiving account; for expenses and savings it is the funding account. The API does not choose an arbitrary journal line.

## Cursor and updates

Migration `202609020001_aemeath_read_integration.sql` adds a non-null `transactions.updated_at` timestamp and a trigger that advances it on every transaction update. Existing rows are initialized from `created_at`.

Rows are ordered by `(updated_at, id)`. The opaque base64url cursor contains a validated version, UTC timestamp, and decimal transaction id. The unique id resolves equal timestamps. Updating an older transaction gives it a new `updated_at`, so the same stable `external_id` appears after the prior cursor with changed content. A malformed cursor returns HTTP 400 and does not alter server state.

## Errors

| Status | Meaning |
| --- | --- |
| 200 | Valid page, including an empty page |
| 400 | Invalid or repeated query parameter, limit, or cursor |
| 401 | Missing, malformed, unknown, expired, or revoked token |
| 403 | Valid token without the required read scope |
| 500 | A record cannot be mapped safely or another internal failure occurs |
| 503 | Integration schema or authentication storage is temporarily unavailable |

Errors contain only a stable code and public message. SQL text, stack traces, token values, hashes, service credentials, and Supabase error details are not returned.

## Rate and security boundaries

The endpoint bounds every page to 500 records and validates authorization and cursor lengths before querying. No Redis or paid rate-limit dependency was introduced. Vercel instances do not provide a reliable shared in-memory counter, so there is no durable distributed 429 limit in this version. A platform-level Vercel limit can be added later without changing the API contract.

`SUPABASE_SERVICE_ROLE_KEY` must be configured only as a Vercel server environment variable. It must never use a `NEXT_PUBLIC_` prefix. The token determines the user; query parameters cannot select another tenant. Token rows have RLS enabled and no anon/authenticated policies or grants.

Authentication hashes a fixed-format, high-entropy token before performing a unique database lookup; plaintext tokens are never compared with database values. This avoids exposing plaintext comparison timing and keeps any remaining database-index timing independent of the secret token bytes.

## Aemeath configuration

```text
LEDGERFLOW_BASE_URL=https://<ledgerflow-vercel-domain>
endpoint=/api/integrations/aemeath/p9c/ledgerflow/v1/transactions
Authorization=Bearer <one-time-generated-integration-token>
limit=500
```

Use Aemeath's request timeout as `timeout_seconds`; LedgerFlow does not accept it as a query parameter. Pass `next_cursor` unchanged on the next sync run.

Example request with placeholders:

```bash
curl -H "Authorization: Bearer <integration-token>" \
  "https://<ledgerflow-vercel-domain>/api/integrations/aemeath/p9c/ledgerflow/v1/transactions?limit=500"
```
