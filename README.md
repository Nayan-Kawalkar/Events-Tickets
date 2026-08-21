# College Digital Event Ticketing

Mobile-first web app that replaces printed event passes with digital tickets. Students
register with a college account; organizers create events and ticket types and see who is
registered, students carry a signed QR ticket, and gate volunteers scan it for one-time entry.
Paid tickets are collected by manual UPI transfer with organizer verification.

Roadmap: [`../claude.md`](../claude.md) · Blueprint: [`../college-digital-ticketing-implementation.md`](../college-digital-ticketing-implementation.md)

## What is built

**Phase 0 — setup & foundation**

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4, npm workspaces (`apps/web`, `packages/db`)
- Prisma + PostgreSQL schema: `users`, `events`, `ticket_types`, `tickets`, `audit_logs`
- Email + password auth (bcrypt, 12 rounds) with signed HTTP-only session cookies
- `Role` on the user: `STUDENT` / `ORGANIZER` / `ADMIN`, enforced server-side
- Pages: home (published events), event detail, `/login`, `/register`, `/dashboard`
- Zod validation on every write, rate limiting on auth endpoints, seed script for demo data

**Phase 1 — event & ticket management**

- `/organizer/events` — list with Draft/Published/Closed filters, Publish/Close actions
- Create and edit events, with slug auto-generation and server-side date rules
- Multiple ticket types per event: price, capacity, sales window, student-ID requirement,
  transferable flag, max per user
- `/organizer/events/[eventId]/attendees` — searchable attendee list plus CSV export
- Audit log entries for event, ticket-type and export actions

**Phase 2 — student registration & ticket issuance**

- Register button per ticket type on the event page, with live "sold out" / "you have this
  ticket" / "opens soon" states
- Server-side eligibility: event status, registration window, ticket sales window, per-type
  capacity, event capacity, `maxPerUser`, and `requiresStudentId` → roll number present
- Tickets issued with a random unguessable `publicId`, `status = ISSUED`, `qrVersion = 1`
- `/student/tickets` and `/student/tickets/[publicId]` — visible to the holder and admins only
- `/student/profile` so students can add the roll number student-only tickets require
- Confirmation email, printed to the server console until an email API key is configured
- Every issuance and every refusal written to `audit_logs`

### Overselling

`registerForEvent()` runs all its checks and the insert inside one **serializable** transaction,
retrying on serialization failure. Two people clicking Register for the last seat at the same
instant cannot both get it: Postgres aborts one, the retry re-reads the count and returns
`TICKET_TYPE_SOLD_OUT`. Paid ticket types are refused outright (`PAID_NOT_SUPPORTED`) — a paid
ticket must wait for verified payment rather than be issued for free.

**Phase 3 — QR codes & gate scanner**

- Signed QR payload `v1.<publicId>.<expiresAt>.<signature>`, HMAC-SHA256, no personal data
- QR rendered server-side as an inline SVG on the ticket page
- `POST /api/checkin/validate` — verifies signature, event, scanner permission and ticket
  state, then consumes the ticket atomically
- `/scanner` — camera scanning (@zxing/browser), full-screen green/red result, sound and
  vibration, auto-reset after 2.5s, last 5 scans, manual code entry, offline warning
- Every attempt recorded in `checkin_attempts`, including invalid and forged codes

### One-time check-in

The consuming write is a single conditional statement:

```sql
UPDATE tickets SET status = 'CHECKED_IN', ...
WHERE id = $1 AND event_id = $2 AND status = 'ISSUED'
```

Zero rows affected means the ticket was already used, cancelled, blocked or expired, and the
scanner re-reads the row to say which. There is no read-then-write gap, so simultaneous scans
at two gates cannot both succeed — verified against Postgres: two concurrent updates on one
ticket returned 1 and 0 rows.

### QR security properties

Verified by test: a valid payload passes; a one-character change to the signature, a changed
ticket id, or an extended expiry are all rejected as `INVALID_SIGNATURE`; a past expiry is
`EXPIRED`; an unknown version is `UNSUPPORTED_VERSION`. The signature is checked before any
field is trusted, and compared in constant time. Rotating `QR_SIGNING_SECRET` invalidates every
QR already issued.

A signature proves the payload came from us — not that the ticket is unused. Both checks matter.

**Phase 4 — manual UPI payments**

- Ticket types choose a `paymentMode`: `AUTOMATIC` (free) or `MANUAL_UPI`
- Organizer sets their UPI ID, account name and an optional UPI QR image per ticket type
- Student sees the QR, UPI ID and exact amount, pays directly, then submits a UTR and a
  screenshot — this creates a `PENDING` record and **no ticket**
- `/organizer/events/[eventId]/payments` — verification queue with the screenshot, payer
  details and UTR, plus Verify (issues the ticket) and Reject (with a reason)
- `/student/payments` — the student sees pending / verified / rejected, with the reason
- Email on submit, on verification (the ticket) and on rejection
- Every submit, verify and reject written to `audit_logs`

### Why a payment record is not a ticket

A screenshot is a picture, not a payment. Verification is a human step: the organizer confirms
the money arrived in their own UPI or bank app, and only then does a ticket exist. The UI says
this on both sides, and the verify button asks for confirmation.

Two organizers clicking Verify at once cannot issue two tickets — the update is guarded on
`status = 'PENDING'`, verified against Postgres (concurrent updates returned 1 and 0 rows). If a
seat has gone in the meantime, the whole transaction rolls back and the payment stays `PENDING`
so it can be retried or rejected. Pending payments count against capacity, so an organizer
cannot verify more payments than there are seats.

### Uploads

Images are stored in Postgres (`uploads` table), so there is no bucket to configure. Files are
capped at 5 MB and accepted only if their **magic bytes** are JPEG, PNG or WebP — a declared
Content-Type is ignored. SVG, HTML and executables are rejected (verified by test). Payment
screenshots are served only to the student who uploaded them and to someone who can manage the
event; anyone else gets a 404. Move to object storage before high volume.

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer (local or managed)

## Setup

```bash
npm install
```

Approve the native install scripts once (Prisma engines, esbuild, sharp):

```bash
npm approve-scripts --allow-scripts-pending
```

Create the environment file — a single `.env` at the repo root serves both Next.js and the
Prisma CLI:

```bash
cp .env.example .env
```

Generate a session secret and paste it into `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Supabase

Supabase gives you two connection strings under **Project Settings → Database**:

| Setting | Which string | Port |
|---|---|---|
| `DATABASE_URL` | Transaction pooler | 6543 |
| `DIRECT_URL` | Session pooler | 5432 |

Migrations must use `DIRECT_URL`: the transaction pooler cannot run DDL or take the advisory
lock Prisma needs. Copy both from the dashboard — the session string is **not** the transaction
string with the port changed; the credentials differ, and swapping the port yields
`P1001` or `28P01 password authentication failed`.

Set `DATABASE_URL` to your PostgreSQL connection string, then create the schema and demo data:

```bash
npm run db:generate
```

```bash
npm run db:deploy
```

```bash
npm run db:seed
```

Start the dev server on http://localhost:3000:

```bash
npm run dev
```

### Demo accounts

Seeded with the password in `SEED_PASSWORD` (default `Password123!`):

| Role | Email |
|---|---|
| ADMIN | `admin@example.edu` |
| ORGANIZER | `organizer@example.edu` |
| STUDENT | `student@example.edu` |

The seed script refuses to run when `NODE_ENV=production`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Generate the Prisma client and build for production |
| `npm start` | Run the production build |
| `npm run db:generate` | Regenerate the Prisma client after schema edits |
| `npm run db:migrate` | Create and apply a new migration (development) |
| `npm run db:deploy` | Apply existing migrations (CI/production) |
| `npm run db:seed` | Insert demo users, events and ticket types |
| `npm run db:studio` | Browse the database in Prisma Studio |

## API

All write endpoints require a session cookie, check the caller's role, validate the body
with a strict Zod schema (unknown fields are rejected) and verify the request origin.

| Method | Endpoint | Who |
|---|---|---|
| POST | `/api/auth/register` | Anyone — always creates a `STUDENT` |
| POST | `/api/auth/login` | Anyone |
| POST | `/api/auth/logout` | Signed-in user |
| GET | `/api/me` | Signed-in user |
| PATCH | `/api/me` | Signed-in user — own profile only |
| POST | `/api/events/:eventId/register` | Signed-in user |
| POST | `/api/events/:eventId/manual-payments` | Signed-in user (multipart) |
| POST | `/api/organizer/manual-payments/:paymentId` | Event owner or `ADMIN` — verify/reject |
| POST | `/api/uploads` | `ORGANIZER`, `ADMIN` — UPI QR only |
| GET | `/api/uploads/:uploadId` | Owner, or event manager for payment proofs |
| POST | `/api/checkin/validate` | `ORGANIZER` (own events), `ADMIN` |
| GET | `/api/scanner/events` | `ORGANIZER` (own events), `ADMIN` |
| POST | `/api/organizer/events` | `ORGANIZER`, `ADMIN` |
| PATCH | `/api/organizer/events/:eventId` | Event owner or `ADMIN` |
| POST | `/api/organizer/events/:eventId/ticket-types` | Event owner or `ADMIN` |
| PATCH | `/api/organizer/ticket-types/:ticketTypeId` | Event owner or `ADMIN` |
| DELETE | `/api/organizer/ticket-types/:ticketTypeId` | Event owner or `ADMIN` |
| GET | `/organizer/events/:eventId/attendees/export` | Event owner or `ADMIN` |

Errors use one shape: `{ error, message, fields? }`, where `fields` maps a form field to its
message.

## Security notes

- **Authorization is server-side on every route.** `middleware.ts` only checks that a session
  cookie exists so anonymous visitors get a login redirect; it never decides roles. Pages use
  `requireRole()` and API routes use `requireOrganizerApi()` / `findManageableEvent()`.
- **No IDOR.** An event that exists but belongs to another organizer returns 404, identical to
  one that does not exist, so IDs cannot be enumerated.
- **Business rules that protect attendees.** Event capacity cannot drop below issued tickets or
  below the seats already allocated to ticket types; once tickets exist, a ticket type's price
  and student-ID requirement are frozen and the type cannot be deleted.
- **Auth hardening.** Rate limits per IP and per account on login, per IP on registration; a
  dummy bcrypt comparison on unknown emails so timing does not leak account existence; login
  failures are never told which half was wrong.
- **CSRF.** Session cookies are `SameSite=Lax` and every write checks that `Origin` matches `Host`.
- **CSV safety.** Exported cells starting with `=`, `+`, `-` or `@` are prefixed so spreadsheets
  do not execute them as formulas.
- The in-memory rate limiter holds counts per process. Move it to Redis before running more
  than one instance.
- Never commit `.env`.

## Known environment note

This repository sits in a path containing `&` (`Events&Ticket`). Windows `cmd` splits on that
character, which breaks npm's generated `.cmd` shims. All scripts therefore call Node directly
(`node node_modules/prisma/build/index.js …`) rather than the shim names, and work as written.

## Not yet built

A payment **gateway** (Razorpay/Stripe order + webhook) is not built — only manual UPI. A paid
ticket type left on `AUTOMATIC` is still refused with `PAID_NOT_SUPPORTED`; switch it to
`MANUAL_UPI` to collect money today. After that: organizations, dynamic QR for high-demand
events, and college SSO.

Manual payments have no automatic expiry yet. The `EXPIRED` status exists but nothing sets it,
so stale pending claims hold their seat until an organizer rejects them.

### Operational notes for the scanner

- The camera needs **HTTPS or localhost** — browsers block `getUserMedia` on plain HTTP over a
  LAN address. Use a tunnel or a TLS dev certificate when testing on a phone.
- Organizers can only scan events they created; admins can scan any. There is no separate
  `SCANNER` role yet, so a volunteer needs an organizer account on the event.
- The rate limit is 300 scans per scanner per minute, held in process memory. It resets on
  deploy and is per-instance.
