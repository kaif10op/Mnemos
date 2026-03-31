# Mnemos API Documentation

## Base URL
```
http://localhost:5050/api
```

---

## Authentication

### Register User
**Endpoint:** `POST /auth/register`

**Description:** Create a new user account

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Validation:**
- Email must be valid (e.g., user@domain.com)
- Password must be at least 8 characters
- Password must include uppercase, lowercase, and numbers

**Response (201):**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com"
  }
}
```

**Errors:**
- `400`: Email already registered, validation failed
- `429`: Too many registration attempts (rate limited: 5/15min)
- `500`: Server error

---

### Login
**Endpoint:** `POST /auth/login`

**Description:** Authenticate user and get JWT token

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com"
  }
}
```

**Errors:**
- `400`: Invalid email or password
- `429`: Too many login attempts (rate limited: 5/15min)
- `500`: Server error

---

### Get Current User
**Endpoint:** `GET /auth/me`

**Description:** Get authenticated user info

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "createdAt": "2026-03-31T15:00:00Z"
}
```

**Errors:**
- `401`: No token or invalid token
- `500`: Server error

---

## Notes Sync

### Fetch Notes from Cloud
**Endpoint:** `GET /sync`

**Description:** Get all active notes and folders for the current user

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "notes": [
    {
      "id": "note-123",
      "title": "My Note",
      "content": "<h2>Hello</h2>",
      "folderId": "folder-456",
      "tags": ["work", "important"],
      "pinned": true,
      "updatedAt": "2026-03-31T15:00:00Z"
    }
  ],
  "folders": [
    {
      "id": "folder-456",
      "name": "Work",
      "icon": "briefcase"
    }
  ]
}
```

**Errors:**
- `401`: Unauthorized
- `500`: Server error

---

### Sync Notes with Cloud
**Endpoint:** `POST /sync`

**Description:** Push local notes to cloud and receive merged data

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request:**
```json
{
  "notes": [
    {
      "id": "note-123",
      "title": "My Note",
      "content": "<h2>Hello</h2>",
      "folderId": "folder-456",
      "tags": ["work"],
      "pinned": false,
      "updatedAt": "2026-03-31T15:00:00Z"
    }
  ],
  "folders": [
    {
      "id": "folder-456",
      "name": "Work",
      "icon": "briefcase"
    }
  ]
}
```

**Response (200):**
```json
{
  "notes": [...],
  "folders": [...]
}
```

**Rules:**
- Client note IDs are mapped to server IDs
- Later timestamps take precedence
- Notes not in payload are soft-deleted (moved to trash)
- Server state is returned to client for merge

**Errors:**
- `400`: Validation failed
- `401`: Unauthorized
- `500`: Server error

---

## Trash Management

### Get Trash Notes
**Endpoint:** `GET /sync/trash`

**Description:** Retrieve all deleted notes from trash

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "notes": [
    {
      "id": "note-123",
      "title": "Deleted Note",
      "content": "...",
      "updatedAt": "2026-03-25T10:00:00Z",
      "deletedAt": "2026-03-31T15:00:00Z"
    }
  ]
}
```

---

### Restore Note from Trash
**Endpoint:** `POST /sync/restore/:noteId`

**Description:** Restore a deleted note back to active notes

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "msg": "Note restored",
  "note": {
    "id": "note-123",
    "title": "Restored Note",
    "content": "...",
    "updatedAt": "2026-03-31T15:00:00Z"
  }
}
```

**Errors:**
- `404`: Note not found
- `400`: Note is not in trash
- `401`: Unauthorized

---

### Delete Note Permanently
**Endpoint:** `DELETE /sync/trash/:noteId`

**Description:** Permanently delete a note from trash (cannot be recovered)

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "msg": "Note permanently deleted"
}
```

**Errors:**
- `404`: Note not found
- `401`: Unauthorized

---

### Cleanup Old Trash
**Endpoint:** `POST /sync/cleanup`

**Description:** Permanently delete notes in trash for more than 30 days

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "msg": "Cleaned up 5 old deleted notes",
  "count": 5
}
```

---

## Health & Status

### Health Check
**Endpoint:** `GET /health`

**Description:** Check server health and status

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-31T15:05:09.701Z"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "msg": "Error description"
}
```

### Common HTTP Status Codes
- `200`: Success
- `400`: Bad request (validation failed)
- `401`: Unauthorized (missing/invalid token)
- `404`: Resource not found
- `429`: Too many requests (rate limited)
- `500`: Internal server error

### Rate Limiting
- **Auth endpoints:** 5 requests per 15 minutes per IP
- **Headers:** `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`

---

## Data Models

### Note
```typescript
{
  clientId: string       // Client-generated UUID
  title: string         // Note title
  content: string       // HTML content
  folderId: string|null // Client folder ID
  tags: string[]        // Array of tag names
  pinned: boolean       // Is pinned to top
  updatedAt: ISO8601    // Last update timestamp
  deletedAt: ISO8601|null // Deletion timestamp (null if active)
}
```

### Folder
```typescript
{
  clientId: string      // Client-generated UUID
  name: string         // Folder name
  icon: string         // Icon name (e.g., 'folder', 'briefcase')
}
```

### User
```typescript
{
  _id: ObjectId        // MongoDB ID
  email: string        // User email
  password: string     // Hashed password
  createdAt: ISO8601   // Account creation date
}
```

---

## Best Practices

1. **Always include Authorization header** with valid JWT token
2. **Check rate limit headers** `RateLimit-Remaining` to avoid getting blocked
3. **Handle 429 responses** gracefully with exponential backoff
4. **Validate data locally** before sending to API
5. **Use client-side IDs** that persist to handle offline scenarios
6. **Implement garbage collection** to clean up old trash monthly
7. **Never expose JWT tokens** in logs or error messages

---

## Example Workflow

### 1. Register
```bash
curl -X POST http://localhost:5050/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

### 2. Fetch notes
```bash
curl -X GET http://localhost:5050/api/sync \
  -H "Authorization: Bearer {token}"
```

### 3. Sync changes
```bash
curl -X POST http://localhost:5050/api/sync \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": [...],
    "folders": [...]
  }'
```

### 4. Restore deleted note
```bash
curl -X POST http://localhost:5050/api/sync/restore/note-123 \
  -H "Authorization: Bearer {token}"
```

---

## Changelog

### v1.0.0 (Current)
- ✅ Authentication (register/login)
- ✅ Notes sync with conflict resolution
- ✅ Trash/recovery system
- ✅ Rate limiting on auth
- ✅ Input validation
- ✅ Health check endpoint
- ✅ Structured logging

### Planned (v1.1.0)
- Pagination for large note sets
- Bulk operations (delete multiple)
- Export/import endpoints
- Sharing tokens
- Real-time sync with WebSockets
