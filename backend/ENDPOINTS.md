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

**Auth:** None (client discards token)

**Request body:** None

**Response:** `204 No Content`

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
    "sogPath": "sog/file.sog",
    "thumbnailPath": "thumbnails/file.jpg",
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

### POST /objects/exclusive

**Auth:** User JWT

**Cost:** 5 coins

**Content-Type:** `multipart/form-data`

**Fields:**
- `title` (string)
- `description` (string)
- `images` (4–6 image files)

**Response (200):** Created object (type `EXCLUSIVE`, not visible in shop)

---

### POST /objects/public

**Auth:** User JWT

**Cost:** 2 coins

**Content-Type:** `multipart/form-data`

**Fields:**
- `title` (string)
- `description` (string)
- `images` (4–6 image files)

**Response (200):** Created object (type `PUBLIC`, visible in shop)

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
    "thumbnailPath": "thumbnails/file.jpg",
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

**Auth:** None (internal service)

**Content-Type:** `multipart/form-data`

**Fields:** `images` (4–6 image files)

**Response (200):**

```json
{
  "sogFile": null
}
```

---

## Swagger

Interactive API documentation is available at:

`http://localhost:3000/docs`
