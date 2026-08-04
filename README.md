# LedgerFlow

A personal finance app built with Next.js and the Base44 backend.

## Prerequisites

- Node.js 20.19.0 or higher
- A Base44 project with entities deployed

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Set your Base44 credentials in `.env.local`:

```
NEXT_PUBLIC_BASE44_APP_ID=your_app_id
NEXT_PUBLIC_BASE44_APP_BASE_URL=https://your-app-name.db.app
```

4. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |

## Project structure

```
app/                  Next.js App Router pages and layouts
src/components/       UI and feature components
src/pages/            Page-level client components
src/lib/              Auth, utilities, query client
src/api/              Base44 SDK client
base44/entities/      Entity schema definitions
```

## Deploy

Build for production with `npm run build`, then deploy to Vercel or any Node.js host. Ensure `NEXT_PUBLIC_BASE44_*` environment variables are set in your deployment platform.

For Base44-hosted frontend deployment, run `base44 deploy` after building.
