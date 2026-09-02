# LedgerFlow Deployment

## Vercel environment variables

Set these variables for Production, Preview, and Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The anon key is intended for browser use and is protected by Row Level Security. `SUPABASE_SERVICE_ROLE_KEY` is used only by the server-side Aemeath endpoint to validate hashed integration tokens and call its fixed, read-only transaction feed. Never expose it to browser code or store it in a `NEXT_PUBLIC_*` variable.

## Supabase authentication URLs

In Supabase Authentication URL Configuration, set the production Vercel URL as the Site URL. Add local development and the required Vercel preview domains as Redirect URLs:

- `http://localhost:3000/**`
- `https://your-production-domain.example/**`
- the preview URL pattern used by your Vercel project

## Database migrations

Apply all files in `supabase/migrations` in filename order. The strict multi-user migration must be applied before release.

The Aemeath endpoint additionally requires:

- `supabase/migrations/202609020001_aemeath_read_integration.sql`

Apply the migration before deploying the route so `integration_tokens`, `transactions.updated_at`, and `aemeath_fetch_transactions` exist when the first request arrives.

## Aemeath integration token

Generate a token for one LedgerFlow owner after applying the migration:

```powershell
npm.cmd run aemeath:token:create -- --email owner@example.com --name "Aemeath P9C"
```

The command displays the plaintext token once. Put it in Aemeath's environment and retain the returned token id for revocation. See `docs/aemeath-ledgerflow-api.md` for the full contract and revocation command.

## Verification

For local ledger verification only, add `LEDGERFLOW_TEST_EMAIL` and `LEDGERFLOW_TEST_PASSWORD` to `.env.local` for an authenticated test user. Do not add these credentials to Vercel.

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:aemeath
npm.cmd run verify:ledger
npm.cmd run verify:crud
```

After deployment, set `LEDGERFLOW_BASE_URL` and `LEDGERFLOW_AEMEATH_TOKEN` in the verification shell and run `npm.cmd run verify:aemeath`. These variables are verification inputs and are not required by the deployed LedgerFlow application.
