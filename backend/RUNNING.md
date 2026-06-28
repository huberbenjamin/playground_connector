# Running the Marketplace Backend

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+
- Python 3.10+

## Project Structure

```
backend/
├── apps/
│   ├── api/                 # NestJS API
│   │   └── prisma/
│   │       └── seed-assets/ # Source files copied into storage during seed
│   └── python-generator/    # FastAPI SOG generator mock
├── packages/
│   └── shared-types/        # Shared TypeScript types
├── storage/
│   ├── sog/                 # Local .sog file storage
│   └── thumbnails/          # Local thumbnail storage
├── scripts/
│   ├── setup.sh
│   ├── start-api.sh
│   └── start-python.sh
├── .env.example
├── ENDPOINTS.md
└── RUNNING.md
```

## Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `ADMIN_1_USERNAME` | First admin username |
| `ADMIN_1_PASSWORD` | First admin password |
| `ADMIN_2_USERNAME` | Second admin username |
| `ADMIN_2_PASSWORD` | Second admin password |
| `PORT` | API port (default `3000`) |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins. Omit to allow all (handy for ngrok dev) |
| `PYTHON_GENERATOR_URL` | Python service URL (default `http://localhost:8001`) |
| `WORKER_SECRET_TOKEN` | Shared secret sent as `X-Server-Token` on API → Python requests (required) |
| `STORAGE_ROOT` | Path to local storage (default `../../storage` from `apps/api`) |

## Database Setup

### 1. Create PostgreSQL database

```bash
createdb marketplace
```

Or with a dedicated user:

```sql
CREATE USER marketplace WITH PASSWORD 'marketplace';
CREATE DATABASE marketplace OWNER marketplace;
```

Update `DATABASE_URL` in `.env` accordingly:

```
DATABASE_URL="postgresql://marketplace:marketplace@localhost:5432/marketplace?schema=public"
```

### 2. Run setup script

From the repository root:

```bash
chmod +x scripts/*.sh
./scripts/setup.sh
```

This will:
1. Create `.env` if missing
2. Install npm dependencies
3. Build shared types
4. Generate Prisma client
5. Run migrations
6. Seed the initial user pool (10 pregenerated IDs)
7. Seed the default admin shop object (`Object 01`) from `apps/api/prisma/seed-assets/object01/`

### Manual database commands

```bash
# Generate Prisma client
npm run db:generate

# Apply migrations
npm run db:migrate

# Seed user pool
npm run db:seed

# Create a new migration during development
npm run db:migrate:dev --workspace=@marketplace/api
```

## Running the Python Generator Service

### Option A: Using the start script

```bash
./scripts/start-python.sh
```

### Option B: Manual

```bash
cd apps/python-generator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

The service listens on `http://localhost:8001`.

Health check: `GET http://localhost:8001/health`

## Running the API

Ensure PostgreSQL is running and migrations have been applied.

### Option A: Using the start script

```bash
./scripts/start-api.sh
```

### Option B: Manual

```bash
npm run dev:api
```

The API listens on `http://localhost:3000`.

On startup the API:
1. Ensures storage directories exist
2. Ensures 10 pregenerated user IDs exist
3. Exposes Swagger at `http://localhost:3000/docs`

### Production build

```bash
npm run build
npm run start:api
```

## Typical Development Workflow

Open two terminals from the repository root:

**Terminal 1 – Python generator:**

```bash
./scripts/start-python.sh
```

**Terminal 2 – NestJS API:**

```bash
./scripts/start-api.sh
```

## Quick Test

### Admin login

```bash
curl -X POST http://localhost:3000/login-admin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin1","password":"admin1pass"}'
```

### List available user IDs (admin)

```bash
curl http://localhost:3000/admin/user-ids \
  -H "Authorization: Bearer <admin-token>"
```

### User login

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"123456"}'
```

Replace `123456` with an ID from `/admin/user-ids`.

### View shop

```bash
curl http://localhost:3000/shop
```

## Troubleshooting

| Issue | Solution |
|---|---|
| `Can't reach database` | Verify PostgreSQL is running and `DATABASE_URL` is correct |
| `Python generator failed` | Ensure the Python service is running on port 8001 |
| `Invalid user ID` | Use a six-digit ID from `GET /admin/user-ids` |
| Migration errors | Run `npm run db:migrate` from the repo root |
| File storage errors | Ensure `storage/sog` and `storage/thumbnails` exist and are writable |
| `OPTIONS` returns 404 via ngrok | Restart API; ensure ngrok tunnels port `3000`; add `ngrok-skip-browser-warning: true` header in frontend |

## Exposing the API with ngrok

```bash
ngrok http 3000
```

Use the ngrok HTTPS URL as your frontend API base URL.

### CORS + ngrok (important)

If your frontend runs on `http://127.0.0.1:8080` and the API is behind ngrok, **every fetch** must include:

```javascript
headers: {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
}
```

Without `ngrok-skip-browser-warning`, ngrok returns an HTML warning page on the OPTIONS preflight — the browser then reports a CORS error even though the API is configured correctly.

Example admin login:

```javascript
const response = await fetch(`${API_BASE}/login-admin`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
  body: JSON.stringify({ username: 'admin1', password: 'admin1pass' }),
});
```

Optional: restrict origins via `.env`:

```
CORS_ORIGINS="http://127.0.0.1:8080,http://localhost:8080"
```

Restart the API after changing `.env`.

### Troubleshooting ngrok CORS

| Symptom | Fix |
|---|---|
| `No Access-Control-Allow-Origin` on OPTIONS | Add `ngrok-skip-browser-warning: true` to fetch headers |
| Still failing | Confirm ngrok tunnels port `3000` and the API is running |
| 404 on OPTIONS | Restart API after pulling latest CORS changes |

## Coin Economy Summary

| Action | Cost |
|---|---|
| Create exclusive object | 5 coins |
| Create public object | 2 coins |
| Buy from shop (PUBLIC) | 1 coin (transferred to creator) |
| Buy from shop (ADMIN) | 1 coin (removed from system) |
| Gift object | Free |
| Initial user balance | 10 coins |
