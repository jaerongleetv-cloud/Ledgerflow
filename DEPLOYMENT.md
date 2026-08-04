# LedgerFlow Deployment

## Vercel environment variables

Set these variables for Production, Preview, and Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The anon key is intended for browser use and is protected by Row Level Security. Never expose the Supabase `service_role` key or store it in a `NEXT_PUBLIC_*` variable.

## Supabase authentication URLs

In Supabase Authentication URL Configuration, set the production Vercel URL as the Site URL. Add local development and the required Vercel preview domains as Redirect URLs:

- `http://localhost:3000/**`
- `https://your-production-domain.example/**`
- the preview URL pattern used by your Vercel project

## Database migrations

Apply all files in `supabase/migrations` in filename order. The strict multi-user migration must be applied before release.

## Verification

For local ledger verification only, add `LEDGERFLOW_TEST_EMAIL` and `LEDGERFLOW_TEST_PASSWORD` to `.env.local` for an authenticated test user. Do not add these credentials to Vercel.

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify:ledger
npm.cmd run verify:crud
```
