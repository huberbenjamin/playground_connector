# Playground Connector Backend

Monorepo backend for the 3D asset platform with JWT authentication and user management.

## Tech Stack

- Node.js, TypeScript, NestJS
- Prisma ORM, PostgreSQL
- JWT authentication, bcrypt password hashing

## Project Structure

```
apps/api/              NestJS API application
packages/shared-types/ Shared TypeScript types and enums
```

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Configure environment:

```bash
cp apps/api/.env.example apps/api/.env
```

4. Run database migrations:

```bash
npm run prisma:migrate
```

5. Start the API in development mode:

```bash
npm run dev
```

The API runs at `http://localhost:3000`. Swagger docs are at `http://localhost:3000/api/docs`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWT tokens (min 16 chars) |
| `JWT_EXPIRES_IN` | Token expiration (default: `7d`) |
| `ADMIN_EMAIL` | Seeded admin email |
| `ADMIN_PASSWORD` | Seeded admin password |
| `PORT` | Server port (default: `3000`) |

On startup, the system automatically creates the admin account if it does not exist.

## API Endpoints

### Auth
- `POST /auth/register` — Register a new user
- `POST /auth/login` — Login and receive JWT
- `GET /auth/me` — Get current user (protected)
- `POST /auth/logout` — Logout (protected)

### Users
- `GET /users/me` — Get profile (protected)
- `PATCH /users/me` — Update profile (protected)
- `PATCH /users/change-password` — Change password (protected)

### Admin (ADMIN role only)
- `GET /admin/users` — Paginated user list
- `GET /admin/users/:id` — Get user by ID
- `PATCH /admin/users/:id` — Update user role/status
- `DELETE /admin/users/:id` — Soft delete user

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API in watch mode |
| `npm run build` | Build all packages |
| `npm run start:prod` | Start production server |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run migrations (dev) |
| `npm run prisma:migrate:deploy` | Deploy migrations (prod) |
