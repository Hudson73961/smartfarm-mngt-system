# Smart Farmer Management System

A production-oriented farm management platform for small and medium farms, built with React + Vite on the frontend and Express + Prisma + PostgreSQL on the backend.

## Features implemented

- Farmer and administrator authentication with secure session handling
- Farm, crop, livestock, task, expense, income, and activity tracking
- Admin dashboard metrics, user management, and status controls
- Weather fallback and OpenWeather integration when a real API key is configured
- Offline queue support with IndexedDB and automatic reconciliation when online again
- Responsive dashboard UI and PWA-ready frontend shell
- Prisma schema supporting audits, notifications, sync tracking, and extended farm records

## Project structure

- `frontend/` — React + TypeScript dashboard and landing experience
- `backend/` — Express API, Prisma schema, and runtime configuration
- `render.yaml` — Render deployment blueprint for the API
- `frontend/vercel.json` — SPA rewrite config for frontend hosting
- `nginx.conf` — reverse proxy example for production frontend + API
- `docker-compose.yml` — PostgreSQL service definition for local development

## Quick start

### 1) Install dependencies

```bash
cd frontend
npm install

cd ../backend
npm install
```

### 2) Start PostgreSQL

The project expects a PostgreSQL instance. A local PostgreSQL installation works as well as Docker.

```bash
# If Docker is used
cd e:\Smart_Farmer
docker compose up -d
```

Or use a local PostgreSQL install directly, then point the connection string in `backend/.env` at your instance.

### 3) Run Prisma migrations

```bash
cd backend
npx prisma migrate dev --name init
npm run prisma:generate
```

### 4) Create the first administrator

```bash
npm run seed:admin
```

The default admin account is created from the environment values in `backend/.env`, or uses:

- Email: `admin@smartfarmer.local`
- Password: `ChangeMe123!`

### 5) Start the apps

```bash
# backend
cd backend
npm run dev

# frontend (new terminal)
cd frontend
npm run dev -- --host 0.0.0.0
```

The backend listens on `http://localhost:4000` and the frontend usually listens on `http://localhost:5173` or the next available Vite port when 5173 is already in use.

## Environment variables

Copy the examples and customize them:

```bash
cd backend
copy .env.example .env
```

Key settings include:

- `DATABASE_URL`
- `SESSION_SECRET`
- `CLIENT_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `WEATHER_API_KEY`
- `WEATHER_LOCATION`
- `OPENWEATHER_BASE_URL`

## Offline mode testing

1. Open the frontend and log in as a farmer.
2. Disconnect from the network or enable browser offline mode.
3. Create a farm, crop, task, or expense entry.
4. The app stores the change in IndexedDB and marks it as pending.
5. Reconnect and the dashboard automatically triggers the queued sync flow to `/api/sync`.

## Production deployment notes

- Set strong `SESSION_SECRET` and admin credentials in the runtime environment.
- Use a managed PostgreSQL service in production instead of the local compose file.
- Configure a real `WEATHER_API_KEY` for live weather data.
- Set `CLIENT_URL` to your real frontend domain, and `VITE_API_URL` for the frontend when deployed.
- Run the backend behind a reverse proxy and TLS termination.
- Use environment variables rather than committing secrets.

## Deployment examples

### Render (backend)

Use the included `render.yaml` file and add your real environment values.

### Vercel (frontend)

Use the included `frontend/vercel.json` file and set:

```bash
VITE_API_URL=https://your-backend-domain.com
```

### Nginx

Use the included `nginx.conf` as a reverse-proxy template for a static frontend and backend service.

## Validated status

The local system was verified to work with:

- PostgreSQL running locally
- Prisma migrations applied successfully
- admin user seeding successful
- admin login verified in the browser
- farmer registration and dashboard verified in the browser
- backend and frontend production builds executed successfully
