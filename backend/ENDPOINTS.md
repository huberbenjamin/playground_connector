# API Endpoints

Base URL: `http://localhost:3000`

Authentication uses JWT Bearer tokens in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

---

## Authentication

### POST /login

**Auth:** None

**Request body:**

```json
{
  "userId": "123456"
}
```

`userId` must be exactly six digits.

**Response (200):**

```json
{
  "accessToken": "<jwt>"
}
```

**Notes:**
- Activates a `PREGENERATED` user on first login.
- If more than 10 users would be active, the oldest active user is removed and a new pregenerated ID is created.
- Only one active session per user ID is allowed. If the user is already logged in elsewhere, login returns `401` with `"User is already logged in"`.
- After the session expires (same duration as `JWT_EXPIRES_IN`), the user can log in again without calling logout.

**Errors:**
- `401` — invalid user ID, removed user, or user already logged in

---

### POST /login-admin

**Auth:** None

**Request body:**

```json
{
  "username": "admin1",
  "password": "admin1pass"
}
```

**Response (200):**

```json
{
  "accessToken": "<jwt>"
}
```

---

### POST /logout

**Auth:** User JWT

**Request body:** None

**Response:** `204 No Content`

**Notes:**
- Invalidates the current server-side session so the same user ID can log in again from another client.
- The client should also discard the stored JWT after logout.

---

## User Endpoints

### GET /me

**Auth:** User JWT

**Response (200):**

```json
{
  "userId": "123456",
  "state": "ACTIVE",
  "coins": 10,
  "activatedAt": "2025-06-23T12:00:00.000Z"
}
```

---

### GET /coins

**Auth:** User JWT

**Response (200):**

```json
{
  "coins": 10
}
```

---

### GET /objects

**Auth:** User JWT

**Response (200):** Array of owned objects

```json
[
  {
    "objectId": "uuid",
    "title": "My Object",
    "description": "Description",
    "creatorUserId": "123456",
    "sogUrl": "/files/sog/file.sog",
    "thumbnailUrl": "/files/thumbnails/file.jpg",
    "type": "PUBLIC",
    "createdAt": "2025-06-23T12:00:00.000Z",
    "ownedSince": "2025-06-23T12:00:00.000Z"
  }
]
```

---

### GET /objects/:objectId

**Auth:** User JWT

**Response (200):** Single object (must be owned, or be PUBLIC/ADMIN in shop)

---

### POST /objects/generate

**Auth:** User JWT

**Cost:** 2 coins (`PUBLIC`) or 5 coins (`EXCLUSIVE`)

**Content-Type:** `multipart/form-data`

**Fields:**
- `title` (string)
- `description` (string)
- `listingType` (`PUBLIC` = shop listing, `EXCLUSIVE` = private ownership only)
- `images` (1–6 image files, field name repeated per file)

**Flow:**
1. Validates 1–6 images (.jpg, .jpeg, .png, .webp)
2. Checks the user has enough coins for the selected `listingType` (no charge yet)
3. Converts uploaded images to PNG and forwards them to the Python service `POST /generate-sog`
4. On success: deducts coins, stores `.sog` + thumbnail, creates ownership record

**Response (200):** Created object

**Errors:**
- `400` — invalid input, non-JPEG files, or insufficient coins
- `503` — Python generator unavailable or returned no SOG file

---

### POST /objects/exclusive

**Auth:** User JWT

**Cost:** 5 coins

**Content-Type:** `multipart/form-data`

**Fields:**
- `title` (string)
- `description` (string)
- `images` (1–6 image files)

**Note:** Prefer `POST /objects/generate` with `listingType=EXCLUSIVE`.

**Response (200):** Created object (type `EXCLUSIVE`, not visible in shop)

---

### POST /objects/public

**Auth:** User JWT

**Cost:** 2 coins

**Content-Type:** `multipart/form-data`

**Fields:**
- `title` (string)
- `description` (string)
- `images` (1–6 image files)

**Note:** Prefer `POST /objects/generate` with `listingType=PUBLIC`.

---

### POST /objects/:objectId/gift

**Auth:** User JWT

**Request body:**

```json
{
  "recipientUserId": "654321"
}
```

**Response (200):** Object details. Succeeds without duplication if recipient already owns the object.

---

### GET /shop

**Auth:** None

**Response (200):** Array of PUBLIC and ADMIN objects

```json
[
  {
    "objectId": "uuid",
    "title": "Shop Item",
    "description": "Description",
    "creatorUserId": "123456",
    "thumbnailUrl": "/files/thumbnails/file.jpg",
    "sogUrl": "/files/sog/file.sog",
    "type": "PUBLIC",
    "createdAt": "2025-06-23T12:00:00.000Z"
  }
]
```

---

### POST /shop/:objectId/buy

**Auth:** User JWT

**Cost:** 1 coin

**Request body:** None

**Response (200):** Purchased object

**Rules:**
- Buyer must not already own the object.
- PUBLIC: buyer loses 1 coin, creator gains 1 coin.
- ADMIN: buyer loses 1 coin, coin is removed from circulation.

---

## Admin Endpoints

### GET /admin/user-ids

**Auth:** Admin JWT

**Response (200):** All user IDs ordered by state and activation time

```json
[
  {
    "userId": "123456",
    "state": "PREGENERATED",
    "activatedAt": null,
    "createdAt": "2025-06-23T12:00:00.000Z"
  }
]
```

---

### GET /admin/users

**Auth:** Admin JWT

**Response (200):** All users with coin balances

---

### GET /admin/objects

**Auth:** Admin JWT

**Response (200):** All objects in the system

---

### POST /admin/users/:userId/add-coins

**Auth:** Admin JWT

**Request body:**

```json
{
  "amount": 5
}
```

**Response (200):**

```json
{
  "userId": "123456",
  "coins": 15
}
```

---

### DELETE /admin/users/:userId

**Auth:** Admin JWT

**Path parameter:** `userId` — exactly six digits

**Flow:**
1. Marks the user as `REMOVED` and cleans up their object ownership (same logic as automatic eviction when the active-user cap is reached)
2. Creates a new `PREGENERATED` user with a fresh 6-digit ID and 10 coins so the pool stays at 10 usable users

**Response (200):**

```json
{
  "removedUserId": "123456",
  "newUserId": "789012"
}
```

**Errors:**
- `400` — invalid `userId` format, system user (`000000`), or user already removed
- `404` — user not found

---

### POST /admin/objects

**Auth:** Admin JWT

**Content-Type:** `multipart/form-data`

**Fields:**
- `title` (string)
- `description` (string)
- `sog` (.sog file)
- `thumbnail` (image file)

**Response (200):** Created ADMIN object (always visible in shop, never deleted)

---

### GET /admin/stats

**Auth:** Admin JWT

**Response (200):**

```json
{
  "activeUsers": 3,
  "removedUsers": 1,
  "pregeneratedUsers": 6,
  "totalObjects": 12,
  "publicObjects": 8,
  "exclusiveObjects": 2,
  "adminObjects": 2
}
```

---

## Python Generator Service

Base URL: `http://localhost:8001`

### POST /generate-sog

**Auth:** `X-Server-Token` header (must match `WORKER_SECRET_TOKEN` in `.env`)

**Content-Type:** `multipart/form-data`

**Fields:** `images` (1–6 image files)

**Response (200):** Binary `.sog` file (`application/octet-stream`) or JSON with base64 `sogFile` (legacy mock)

**Errors:**
- `401` — missing or invalid worker secret token
- `500` — `WORKER_SECRET_TOKEN` not configured on the Python service

**Note:** `GET /health` remains unauthenticated for liveness checks.

---

## File Downloads

Stored assets live on the API server disk. API responses expose public URLs:

- `thumbnailUrl` — shop / object preview image
- `sogUrl` — downloadable 3D object file (owned objects)

Prefix with your API base URL:

```
https://your-api.example.com/files/thumbnails/object01.jpg
```

### GET /files/:folder/:filename

**Auth:** None

**Path params:**
- `folder` — `thumbnails` or `sog`
- `filename` — e.g. `object01.jpg`

**Example:**

```
GET /files/thumbnails/object01.jpg
GET /files/sog/object01.sog
```

**Response (200):** Binary file stream with appropriate `Content-Type`

---

## Swagger

Interactive API documentation is available at:

`http://localhost:3000/docs`
