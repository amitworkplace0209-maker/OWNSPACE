# Ownspece

Personal project operating system for managing software, technical, and
personal projects from planning through completion and deployment.

Built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, and
Supabase (PostgreSQL, Auth, Storage).

## Status

- **Phase 1 complete:** Project initialization, folder structure, application
  shell (sidebar, topbar, mobile bottom nav, theme system), placeholder routes.
- **Sign-in is an MPIN sign-in:** email + MPIN, with the account password kept
  as the recovery secret. New accounts choose their MPIN when they sign up.
- **The app lock asks for the MPIN every time the app is closed**, and a
  device can unlock with its own fingerprint or a device PIN instead.
- **Notifications behave like the phone's own:** system alerts with "Done" and
  "Snooze", an unread badge on the app icon, and push that reaches a closed
  app.

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase credentials (Phase 2)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script                | Description                          |
| --------------------- | ------------------------------------ |
| `npm run dev`         | Start the development server         |
| `npm run build`       | Create a production build            |
| `npm run start`       | Start the production server          |
| `npm run lint`        | Run ESLint                           |
| `npm run typecheck`   | Run the TypeScript compiler          |

## Environment

See [ENVIRONMENT.md](ENVIRONMENT.md) and `.env.example` for all environment
variables. Never commit real credentials.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [ENVIRONMENT.md](ENVIRONMENT.md)
- [DATABASE.md](DATABASE.md)
- [SECURITY.md](SECURITY.md)
- [PWA.md](PWA.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

## Project Structure

```
src/
  app/          # App Router routes
  components/   # UI primitives + layout + shared components
  config/       # Static configuration (navigation, etc.)
  features/     # Feature-specific components and logic
  hooks/        # Shared React hooks
  lib/          # Utilities (supabase clients, db helpers)
  types/        # Shared TypeScript types
  utils/        # Pure utility functions
supabase/
  migrations/   # SQL migrations for the database schema
```