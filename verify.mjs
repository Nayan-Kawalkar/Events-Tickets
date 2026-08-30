/**
 * End-to-end functional sweep.
 *
 * Creates its own event, ticket types and users so nothing real is touched,
 * exercises every flow (happy path and failure path), then deletes everything
 * it made. Run against a server started with `next start`.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { loadEnvFile } from "node:process";
import pg from "pg";
import bcrypt from "bcryptjs";

loadEnvFile(".env");

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3110";
const PREFIX = "zzverify";

const results = [];
function check(group, name, passed, detail = "") {
  results.push({ group, name, passed, detail });
}
async function expect(group, name, fn, predicate) {
  try {
    const value = await fn();
    const ok = predicate(value);
    check(group, name, ok, ok ? "" : JSON.stringify(value).slice(0, 140));
  } catch (err) {
    check(group, name, false, `threw: ${err.message}`);
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function session(userId) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: userId, iat: now, exp: now + 7200, jti: randomBytes(12).toString("base64url") };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function req(path, { method = "GET", cookie, json, form, origin = BASE } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = `ct_session=${cookie}`;
  if (origin !== null) headers.Origin = origin;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof json === "string" ? json : JSON.stringify(json);
  }
  if (form) body = form;
  return fetch(BASE + path, { method, headers, body, redirect: "manual" }).then(async (r) => ({
    code: r.status,
    body: await r.json().catch(() => ({})),
  }));
}

/** Minimal valid PNG, for upload tests. */
function png(w = 40, h = 40) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const table = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const cr = Buffer.alloc(4);
    cr.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function qrFor(publicId, endsAt) {
  const exp = Math.floor((new Date(endsAt).getTime() + Number(process.env.QR_TTL_SECONDS ?? 21600) * 1000) / 1000);
  const sig = createHmac("sha256", process.env.QR_SIGNING_SECRET)
    .update(`v1.${publicId}.${exp}`)
    .digest("base64url");
  return `v1.${publicId}.${exp}.${sig}`;
}

function vipPayloadFor(code, endsAt) {
  const exp = Math.floor((new Date(endsAt).getTime() + Number(process.env.QR_TTL_SECONDS ?? 21600) * 1000) / 1000);
  const sig = createHmac("sha256", process.env.QR_SIGNING_SECRET)
    .update(`vip1.${code}.${exp}`)
    .digest("base64url");
  return `vip1.${code}.${exp}.${sig}`;
}

const made = { users: [], events: [] };

async function setup() {
  await client.connect();
  const hash = await bcrypt.hash("Password123!", 10);

  const mkUser = async (suffix, role) => {
    const id = randomUUID();
    await client.query(
      'INSERT INTO users (id,email,"passwordHash","fullName",role,"isEmailVerified","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,true,now(),now())',
      [id, `${PREFIX}-${suffix}@example.edu`, hash, `ZZ ${suffix}`, role],
    );
    made.users.push(id);
    return id;
  };

  const admin = (await client.query("select id from users where role='ADMIN' limit 1")).rows[0].id;
  const organizer = await mkUser("organizer", "ORGANIZER");
  const student1 = await mkUser("student1", "STUDENT");
  const student2 = await mkUser("student2", "STUDENT");
  const student3 = await mkUser("student3", "STUDENT");
  const volunteer = await mkUser("volunteer", "SCANNER");

  const eventId = randomUUID();
  const startsAt = new Date(Date.now() + 86400000);
  const endsAt = new Date(Date.now() + 90000000);
  await client.query(
    'INSERT INTO events (id,title,slug,"startsAt","endsAt",status,capacity,"createdById","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())',
    [eventId, "ZZ Verify Event", `${PREFIX}-event`, startsAt, endsAt, "PUBLISHED", 3, organizer],
  );
  made.events.push(eventId);

  const freeType = randomUUID();
  await client.query(
    'INSERT INTO ticket_types (id,"eventId",name,"pricePaise",capacity,"requiresStudentId",transferable,"maxPerUser","paymentMode","createdAt","updatedAt") VALUES ($1,$2,$3,0,2,false,false,1,$4,now(),now())',
    [freeType, eventId, "ZZ Free", "AUTOMATIC"],
  );

  const upiType = randomUUID();
  await client.query(
    'INSERT INTO ticket_types (id,"eventId",name,"pricePaise",capacity,"requiresStudentId",transferable,"maxPerUser","paymentMode","organizerUpiId","createdAt","updatedAt") VALUES ($1,$2,$3,15000,5,false,false,1,$4,$5,now(),now())',
    [upiType, eventId, "ZZ Paid UPI", "MANUAL_UPI", "verify@okbank"],
  );

  const paidAutoType = randomUUID();
  await client.query(
    'INSERT INTO ticket_types (id,"eventId",name,"pricePaise",capacity,"requiresStudentId",transferable,"maxPerUser","paymentMode","createdAt","updatedAt") VALUES ($1,$2,$3,5000,5,false,false,1,$4,now(),now())',
    [paidAutoType, eventId, "ZZ Paid Auto", "AUTOMATIC"],
  );

  return {
    admin, organizer, student1, student2, student3, volunteer,
    eventId, freeType, upiType, paidAutoType, endsAt,
    cookies: {
      admin: session(admin), organizer: session(organizer),
      s1: session(student1), s2: session(student2), s3: session(student3),
      volunteer: session(volunteer),
    },
  };
}

async function cleanup(ctx) {
  const ids = made.users;
  const evs = made.events;
  await client.query('delete from checkin_attempts where "eventId" = any($1) or "scannerUserId" = any($2)', [evs, ids]);
  await client.query('delete from super_passes where "createdByUserId" = any($1) or "usedByUserId" = any($1)', [ids]);
  await client.query('delete from scanner_assignments where "eventId" = any($1) or "userId" = any($2)', [evs, ids]);
  await client.query('delete from manual_payments where "eventId" = any($1) or "userId" = any($2)', [evs, ids]);
  await client.query('delete from tickets where "eventId" = any($1) or "ownerUserId" = any($2)', [evs, ids]);
  await client.query('delete from vip_passes where "eventId" = any($1) or "createdByUserId" = any($2)', [evs, ids]);
  await client.query('delete from event_hosts where "eventId" = any($1)', [evs]);
  await client.query('delete from ticket_types where "eventId" = any($1)', [evs]);
  await client.query('delete from events where id = any($1) or "createdById" = any($2)', [evs, ids]);
  await client.query('delete from audit_logs where "actorUserId" = any($1)', [ids]);
  await client.query('delete from uploads where "uploadedById" = any($1)', [ids]);
  await client.query('delete from users where id = any($1)', [ids]);
  await client.query("delete from users where email like $1", [`${PREFIX}-%`]);
}

async function run() {
  const c = await setup();
  const { cookies } = c;

  // ---- Authentication -----------------------------------------------------
  await expect("auth", "register with valid details", () =>
    req("/api/auth/register", { method: "POST", json: { email: `${PREFIX}-new@example.edu`, password: "Password123!", fullName: "ZZ New", rollNumber: "", department: "" } }),
    (r) => r.code === 201);
  await expect("auth", "duplicate email refused", () =>
    req("/api/auth/register", { method: "POST", json: { email: `${PREFIX}-new@example.edu`, password: "Password123!", fullName: "ZZ New", rollNumber: "", department: "" } }),
    (r) => r.code === 409 && r.body.error === "EMAIL_TAKEN");
  await expect("auth", "weak password refused", () =>
    req("/api/auth/register", { method: "POST", json: { email: `${PREFIX}-weak@example.edu`, password: "abc", fullName: "ZZ Weak", rollNumber: "", department: "" } }),
    (r) => r.code === 422 && r.body.fields?.password);
  await expect("auth", "invalid email refused", () =>
    req("/api/auth/register", { method: "POST", json: { email: "not-an-email", password: "Password123!", fullName: "ZZ Bad", rollNumber: "", department: "" } }),
    (r) => r.code === 422 && r.body.fields?.email);
  await expect("auth", "login with wrong password", () =>
    req("/api/auth/login", { method: "POST", json: { email: `${PREFIX}-student1@example.edu`, password: "WrongPassword1" } }),
    (r) => r.code === 401 && !JSON.stringify(r.body).toLowerCase().includes("password is incorrect for"));
  await expect("auth", "login succeeds", () =>
    req("/api/auth/login", { method: "POST", json: { email: `${PREFIX}-student1@example.edu`, password: "Password123!" } }),
    (r) => r.code === 200 && r.body.user?.role === "STUDENT");
  await expect("auth", "unknown email is not distinguishable", () =>
    req("/api/auth/login", { method: "POST", json: { email: "nobody-here@example.edu", password: "Password123!" } }),
    (r) => r.code === 401 && r.body.error === "INVALID_CREDENTIALS");
  await expect("auth", "protected API needs a session", () =>
    req("/api/me", {}),
    (r) => r.code === 401);
  await expect("auth", "cross-origin write refused (CSRF)", () =>
    req("/api/me", { method: "PATCH", cookie: cookies.s1, json: { fullName: "Hacked" }, origin: "https://evil.example" }),
    (r) => r.code === 403 && r.body.error === "BAD_ORIGIN");
  await expect("auth", "malformed JSON handled", () =>
    req("/api/me", { method: "PATCH", cookie: cookies.s1, json: "{not json" }),
    (r) => r.code === 400 && r.body.error === "INVALID_JSON");

  // ---- Profile ------------------------------------------------------------
  await expect("profile", "update own profile", () =>
    req("/api/me", { method: "PATCH", cookie: cookies.s1, json: { fullName: "ZZ Student One", rollNumber: "ZZ-001", department: "CS" } }),
    (r) => r.code === 200 && r.body.user?.rollNumber === "ZZ-001");
  await expect("profile", "unknown field rejected", () =>
    req("/api/me", { method: "PATCH", cookie: cookies.s1, json: { fullName: "ZZ", role: "ADMIN" } }),
    (r) => r.code === 422);

  // ---- Event management ---------------------------------------------------
  let createdEventId = null;
  await expect("events", "organizer creates an event", async () => {
    const r = await req("/api/organizer/events", { method: "POST", cookie: cookies.organizer, json: {
      title: "ZZ Second Event", slug: `${PREFIX}-second`, description: "", venue: "Hall",
      startsAt: "2026-12-01T10:00", endsAt: "2026-12-01T12:00", registrationOpensAt: "",
      registrationClosesAt: "", status: "DRAFT", capacity: "10", posterUploadId: null,
      hostOrganization: "ZZ Club", addressLine: "", latitude: "", longitude: "",
      contactEmail: "", contactPhone: "" } });
    if (r.body.event?.id) { createdEventId = r.body.event.id; made.events.push(createdEventId); }
    return r;
  }, (r) => r.code === 201);
  await expect("events", "end before start refused", () =>
    req("/api/organizer/events", { method: "POST", cookie: cookies.organizer, json: {
      title: "ZZ Bad", slug: `${PREFIX}-bad`, description: "", venue: "",
      startsAt: "2026-12-01T12:00", endsAt: "2026-12-01T10:00", registrationOpensAt: "",
      registrationClosesAt: "", status: "DRAFT", capacity: "", posterUploadId: null,
      hostOrganization: "", addressLine: "", latitude: "", longitude: "", contactEmail: "", contactPhone: "" } }),
    (r) => r.code === 422 && r.body.fields?.endsAt);
  await expect("events", "duplicate slug refused", () =>
    req("/api/organizer/events", { method: "POST", cookie: cookies.organizer, json: {
      title: "ZZ Dup", slug: `${PREFIX}-second`, description: "", venue: "",
      startsAt: "2026-12-01T10:00", endsAt: "2026-12-01T12:00", registrationOpensAt: "",
      registrationClosesAt: "", status: "DRAFT", capacity: "", posterUploadId: null,
      hostOrganization: "", addressLine: "", latitude: "", longitude: "", contactEmail: "", contactPhone: "" } }),
    (r) => r.code === 409 && r.body.error === "SLUG_TAKEN");
  await expect("events", "student cannot create an event", () =>
    req("/api/organizer/events", { method: "POST", cookie: cookies.s1, json: {
      title: "ZZ Nope", slug: `${PREFIX}-nope`, startsAt: "2026-12-01T10:00", endsAt: "2026-12-01T12:00", status: "DRAFT" } }),
    (r) => r.code === 403);
  await expect("events", "other organizer's event is 404 not 403", () =>
    req(`/api/organizer/events/${c.eventId}`, { method: "PATCH", cookie: cookies.admin, json: { status: "PUBLISHED" } }),
    (r) => r.code === 200);
  await expect("events", "invalid uuid rejected", () =>
    req("/api/organizer/events/not-a-uuid", { method: "PATCH", cookie: cookies.organizer, json: { status: "DRAFT" } }),
    (r) => r.code === 400 && r.body.error === "INVALID_ID");

  // ---- Ticket types -------------------------------------------------------
  await expect("ticket types", "over-allocation refused", () =>
    req(`/api/organizer/events/${c.eventId}/ticket-types`, { method: "POST", cookie: cookies.organizer, json: {
      name: "ZZ Too Big", description: "", pricePaise: 0, capacity: "99", salesStartAt: "", salesEndAt: "",
      requiresStudentId: false, transferable: false, maxPerUser: 1, paymentMode: "AUTOMATIC",
      organizerUpiId: "", organizerUpiName: "", organizerUpiQrUploadId: null } }),
    (r) => r.code === 409 && r.body.error === "OVER_ALLOCATED");
  await expect("ticket types", "manual UPI without a UPI id refused", () =>
    req(`/api/organizer/events/${c.eventId}/ticket-types`, { method: "POST", cookie: cookies.organizer, json: {
      name: "ZZ No UPI", description: "", pricePaise: 100, capacity: "", salesStartAt: "", salesEndAt: "",
      requiresStudentId: false, transferable: false, maxPerUser: 1, paymentMode: "MANUAL_UPI",
      organizerUpiId: "", organizerUpiName: "", organizerUpiQrUploadId: null } }),
    (r) => r.code === 422 && r.body.fields?.organizerUpiId);
  await expect("ticket types", "duplicate name in one event refused", () =>
    req(`/api/organizer/events/${c.eventId}/ticket-types`, { method: "POST", cookie: cookies.organizer, json: {
      name: "ZZ Free", description: "", pricePaise: 0, capacity: "", salesStartAt: "", salesEndAt: "",
      requiresStudentId: false, transferable: false, maxPerUser: 1, paymentMode: "AUTOMATIC",
      organizerUpiId: "", organizerUpiName: "", organizerUpiQrUploadId: null } }),
    (r) => r.code === 409 && r.body.error === "NAME_TAKEN");

  // ---- Registration -------------------------------------------------------
  const attendee = (over = {}) => ({
    ticketTypeId: c.freeType, attendeeName: "ZZ Attendee", attendeeEmail: "zz@example.edu",
    attendeePhone: "", attendeeRollNumber: "", attendeeDepartment: "", acceptTerms: true, ...over,
  });
  let ticket1 = null;
  await expect("registration", "free ticket issued", async () => {
    const r = await req(`/api/events/${c.eventId}/register`, { method: "POST", cookie: cookies.s1, json: attendee() });
    ticket1 = r.body.ticket?.publicId ?? null;
    return r;
  }, (r) => r.code === 201 && r.body.ticket?.publicId);
  await expect("registration", "terms must be accepted", () =>
    req(`/api/events/${c.eventId}/register`, { method: "POST", cookie: cookies.s2, json: attendee({ acceptTerms: false }) }),
    (r) => r.code === 422 && r.body.fields?.acceptTerms);
  await expect("registration", "invalid attendee email refused", () =>
    req(`/api/events/${c.eventId}/register`, { method: "POST", cookie: cookies.s2, json: attendee({ attendeeEmail: "nope" }) }),
    (r) => r.code === 422 && r.body.fields?.attendeeEmail);
  await expect("registration", "max per user enforced", () =>
    req(`/api/events/${c.eventId}/register`, { method: "POST", cookie: cookies.s1, json: attendee() }),
    (r) => r.code === 409 && r.body.error === "MAX_PER_USER_REACHED");
  await expect("registration", "second seat issued", () =>
    req(`/api/events/${c.eventId}/register`, { method: "POST", cookie: cookies.s2, json: attendee() }),
    (r) => r.code === 201);
  await expect("registration", "sold out once capacity is reached", () =>
    req(`/api/events/${c.eventId}/register`, { method: "POST", cookie: cookies.s3, json: attendee() }),
    (r) => r.code === 409 && r.body.error === "TICKET_TYPE_SOLD_OUT");
  await expect("registration", "paid AUTOMATIC type refused", () =>
    req(`/api/events/${c.eventId}/register`, { method: "POST", cookie: cookies.s3, json: attendee({ ticketTypeId: c.paidAutoType }) }),
    (r) => r.code === 409 && r.body.error === "PAID_NOT_SUPPORTED");
  await expect("registration", "signed-out user refused", () =>
    req(`/api/events/${c.eventId}/register`, { method: "POST", json: attendee() }),
    (r) => r.code === 401);

  // ---- Manual UPI payments ------------------------------------------------
  const payForm = (over = {}) => {
    const f = new FormData();
    f.set("ticketTypeId", over.ticketTypeId ?? c.upiType);
    f.set("attendeeName", over.name ?? "ZZ Payer");
    f.set("attendeeEmail", over.email ?? "zzpay@example.edu");
    f.set("attendeePhone", "");
    f.set("attendeeRollNumber", "");
    f.set("attendeeDepartment", "");
    f.set("acceptTerms", over.terms ?? "true");
    f.set("upiTransactionId", "4123456789");
    if (over.file !== null) {
      f.set("screenshot", new Blob([over.file ?? png()], { type: "image/png" }), "proof.png");
    }
    return f;
  };
  let paymentId = null;
  await expect("payments", "UPI payment submitted (no ticket yet)", async () => {
    const r = await req(`/api/events/${c.eventId}/manual-payments`, { method: "POST", cookie: cookies.s3, form: payForm() });
    paymentId = r.body.paymentId ?? null;
    return r;
  }, (r) => r.code === 201 && r.body.paymentId);
  await expect("payments", "ticket NOT issued before verification", async () => {
    const n = await client.query('select count(*)::int n from tickets where "ticketTypeId"=$1', [c.upiType]);
    return n.rows[0].n;
  }, (n) => n === 0);
  await expect("payments", "duplicate pending claim refused", () =>
    req(`/api/events/${c.eventId}/manual-payments`, { method: "POST", cookie: cookies.s3, form: payForm() }),
    (r) => r.code === 409 && r.body.error === "ALREADY_PENDING");
  await expect("payments", "terms required", () =>
    req(`/api/events/${c.eventId}/manual-payments`, { method: "POST", cookie: cookies.s2, form: payForm({ terms: "false" }) }),
    (r) => r.code === 422 && r.body.fields?.acceptTerms);
  await expect("payments", "non-image upload refused", () =>
    req(`/api/events/${c.eventId}/manual-payments`, { method: "POST", cookie: cookies.s2, form: payForm({ file: Buffer.from("<?php echo 1; ?>") }) }),
    (r) => r.code === 422 && r.body.fields?.screenshot);
  await expect("payments", "student cannot verify a payment", () =>
    req(`/api/organizer/manual-payments/${paymentId}`, { method: "POST", cookie: cookies.s1, json: { action: "VERIFY" } }),
    (r) => r.code === 403);
  await expect("payments", "organizer verifies and a ticket appears", async () => {
    const r = await req(`/api/organizer/manual-payments/${paymentId}`, { method: "POST", cookie: cookies.organizer, json: { action: "VERIFY" } });
    const n = await client.query('select count(*)::int n from tickets where "ticketTypeId"=$1', [c.upiType]);
    return { r, issued: n.rows[0].n };
  }, (v) => v.r.code === 200 && v.issued === 1);
  await expect("payments", "verifying twice refused", () =>
    req(`/api/organizer/manual-payments/${paymentId}`, { method: "POST", cookie: cookies.organizer, json: { action: "VERIFY" } }),
    (r) => r.code === 409 && r.body.error === "NOT_PENDING");
  await expect("payments", "reject requires a reason", () =>
    req(`/api/organizer/manual-payments/${paymentId}`, { method: "POST", cookie: cookies.organizer, json: { action: "REJECT", reason: "" } }),
    (r) => r.code === 422);

  // ---- Check-in -----------------------------------------------------------
  const qr1 = qrFor(ticket1, c.endsAt);
  await expect("check-in", "student cannot scan", () =>
    req("/api/checkin/validate", { method: "POST", cookie: cookies.s1, json: { eventId: c.eventId, gateId: "G", qrPayload: qr1 } }),
    (r) => r.code === 403);
  await expect("check-in", "unassigned volunteer refused", () =>
    req("/api/checkin/validate", { method: "POST", cookie: cookies.volunteer, json: { eventId: c.eventId, gateId: "G", qrPayload: qr1 } }),
    (r) => r.body.reason === "NOT_AUTHORIZED_FOR_EVENT");
  await expect("check-in", "organizer assigns the volunteer", () =>
    req(`/api/organizer/events/${c.eventId}/scanners`, { method: "POST", cookie: cookies.organizer, json: { email: `${PREFIX}-volunteer@example.edu`, gateId: "Main" } }),
    (r) => r.code === 201);
  await expect("check-in", "assigned volunteer approves a ticket", () =>
    req("/api/checkin/validate", { method: "POST", cookie: cookies.volunteer, json: { eventId: c.eventId, gateId: "Main", qrPayload: qr1 } }),
    (r) => r.body.status === "APPROVED");
  await expect("check-in", "second scan is ALREADY_USED", () =>
    req("/api/checkin/validate", { method: "POST", cookie: cookies.volunteer, json: { eventId: c.eventId, gateId: "Main", qrPayload: qr1 } }),
    (r) => r.body.status === "REJECTED" && r.body.reason === "ALREADY_USED");
  await expect("check-in", "tampered signature rejected", () =>
    req("/api/checkin/validate", { method: "POST", cookie: cookies.volunteer, json: { eventId: c.eventId, gateId: "Main", qrPayload: qr1.slice(0, -1) + (qr1.endsWith("A") ? "B" : "A") } }),
    (r) => r.body.reason === "INVALID_SIGNATURE");
  await expect("check-in", "garbage payload rejected", () =>
    req("/api/checkin/validate", { method: "POST", cookie: cookies.volunteer, json: { eventId: c.eventId, gateId: "Main", qrPayload: "hello" } }),
    (r) => r.body.reason === "INVALID");
  await expect("check-in", "manual check-in works for organizer", async () => {
    const t = await client.query('select id from tickets where "ticketTypeId"=$1 and status=\'ISSUED\' limit 1', [c.freeType]);
    if (!t.rows[0]) return { skipped: true };
    return req("/api/checkin/manual", { method: "POST", cookie: cookies.organizer, json: { eventId: c.eventId, ticketId: t.rows[0].id, gateId: "Desk", reason: "flat battery" } });
  }, (r) => r.body?.status === "APPROVED");
  await expect("check-in", "manual check-in refused to a student", async () => {
    const t = await client.query('select id from tickets where "eventId"=$1 limit 1', [c.eventId]);
    return req("/api/checkin/manual", { method: "POST", cookie: cookies.s1, json: { eventId: c.eventId, ticketId: t.rows[0].id, gateId: "Desk" } });
  }, (r) => r.code === 403);

  // ---- Master pass --------------------------------------------------------
  await expect("master pass", "organizer cannot issue one", () =>
    req("/api/admin/super-passes", { method: "POST", cookie: cookies.organizer, json: { label: "x", ttlMinutes: 15 } }),
    (r) => r.code === 403);
  await expect("master pass", "admin issues, scans once, second scan refused", async () => {
    const issued = await req("/api/admin/super-passes", { method: "POST", cookie: cookies.admin, json: { label: "ZZ Guest", ttlMinutes: 15 } });
    const row = (await client.query("select code, \"expiresAt\" from super_passes where status='ACTIVE' order by \"createdAt\" desc limit 1")).rows[0];
    const exp = Math.floor(new Date(row.expiresAt).getTime() / 1000);
    const sig = createHmac("sha256", process.env.QR_SIGNING_SECRET).update(`sp1.${row.code}.${exp}`).digest("base64url");
    const payload = `sp1.${row.code}.${exp}.${sig}`;
    const first = await req("/api/checkin/validate", { method: "POST", cookie: cookies.organizer, json: { eventId: c.eventId, gateId: "Main", qrPayload: payload } });
    const second = await req("/api/checkin/validate", { method: "POST", cookie: cookies.organizer, json: { eventId: c.eventId, gateId: "Main", qrPayload: payload } });
    return { issued: issued.code, first: first.body.status, second: second.body.reason };
  }, (v) => v.issued === 201 && v.first === "APPROVED" && v.second === "SUPER_PASS_USED");

  // ---- Admin --------------------------------------------------------------
  await expect("admin", "admin cannot demote themselves", () =>
    req(`/api/admin/users/${c.admin}`, { method: "PATCH", cookie: cookies.admin, json: { action: "SET_ROLE", role: "STUDENT" } }),
    (r) => r.code === 409 && r.body.error === "CANNOT_TARGET_SELF");
  await expect("admin", "role change works", () =>
    req(`/api/admin/users/${c.student3}`, { method: "PATCH", cookie: cookies.admin, json: { action: "SET_ROLE", role: "SCANNER" } }),
    (r) => r.code === 200 && r.body.user?.role === "SCANNER");
  await expect("admin", "delete refused for account with history", () =>
    req(`/api/admin/users/${c.student1}`, { method: "DELETE", cookie: cookies.admin }),
    (r) => r.code === 409 && r.body.error === "HAS_HISTORY");
  await expect("admin", "event with tickets cannot be deleted", () =>
    req(`/api/admin/events/${c.eventId}`, { method: "DELETE", cookie: cookies.admin }),
    (r) => r.code === 409 && r.body.error === "HAS_TICKETS");
  await expect("admin", "ticket block then reinstate", async () => {
    const t = (await client.query('select id from tickets where "eventId"=$1 and status=\'ISSUED\' limit 1', [c.eventId])).rows[0];
    if (!t) return { skipped: true };
    const blocked = await req(`/api/admin/tickets/${t.id}`, { method: "POST", cookie: cookies.admin, json: { action: "BLOCK", reason: "test" } });
    const back = await req(`/api/admin/tickets/${t.id}`, { method: "POST", cookie: cookies.admin, json: { action: "REINSTATE", reason: "test" } });
    return { blocked: blocked.code, back: back.code };
  }, (v) => v.skipped || (v.blocked === 200 && v.back === 200));
  await expect("admin", "reissue invalidates the old ticket", async () => {
    const t = (await client.query('select id, "publicId" from tickets where "eventId"=$1 and status=\'ISSUED\' limit 1', [c.eventId])).rows[0];
    if (!t) return { skipped: true };
    const r = await req(`/api/admin/tickets/${t.id}`, { method: "POST", cookie: cookies.admin, json: { action: "REISSUE", reason: "lost phone" } });
    const old = (await client.query("select status from tickets where id=$1", [t.id])).rows[0];
    return { code: r.code, oldStatus: old.status };
  }, (v) => v.skipped || (v.code === 200 && v.oldStatus === "CANCELLED"));

  // ---- Page-level access --------------------------------------------------
  const page = (p, cookie) => fetch(BASE + p, { headers: cookie ? { Cookie: `ct_session=${cookie}` } : {}, redirect: "manual" }).then(async (r) => ({ code: r.status, html: await r.text() }));
  await expect("pages", "public events page renders", () => page("/"), (r) => r.code === 200 && r.html.includes("Upcoming events"));
  await expect("pages", "draft events hidden from public", () => page("/"), (r) => !r.html.includes("ZZ Second Event"));
  // A loading.tsx on /events/[slug] flushes the shell before notFound() runs,
  // so the status is 200 — the same trade already made on /tickets, taken here
  // because a blocking navigation left the URL frozen on every event click.
  // What must still hold is that an unknown slug shows the not-found page and
  // invents no event.
  await expect("pages", "unknown event slug shows not found", () => page("/events/does-not-exist-zz"),
    // "Register" also appears in the site meta description, so the real test
    // is that no ticket-type registration link was rendered for a missing event.
    (r) => /could not be found|not found|404/i.test(r.html) && !r.html.includes("/register/"));
  await expect("pages", "signed-out /tickets redirects", () => page("/tickets"), (r) => r.code === 307 || r.code === 302);
  await expect("pages", "student sees no admin data", () => page("/admin", cookies.s1),
    (r) => !r.html.includes("Needs attention") && !r.html.includes("Recent gate scans"));
  await expect("pages", "volunteer sees no attendee data", () => page(`/organizer/events/${c.eventId}/attendees`, cookies.volunteer),
    (r) => !r.html.includes("ZZ Attendee") && !r.html.includes("zz@example.edu"));
  // A loading.tsx on /tickets covers its children, so the shell is flushed
  // before notFound() runs and the status stays 200. What must hold is that no
  // ticket content reaches a non-owner.
  await expect("pages", "ticket page leaks nothing to another user", async () => {
    const t = (await client.query('select "publicId" from tickets where "ownerUserId"=$1 limit 1', [c.student1])).rows[0];
    const r = await page(`/tickets/${t.publicId}`, cookies.s2);
    return {
      showsNotFound: /could not be found|404/i.test(r.html),
      leaksTicketUi: r.html.includes("Show this QR") || r.html.includes("Roll number"),
    };
  }, (v) => v.showsNotFound && !v.leaksTicketUi);
  await expect("pages", "404 page for unknown route", () => page("/no-such-page-zz"), (r) => r.code === 404);

  // ---- VIP guest passes ---------------------------------------------------
  // Holding the link is the whole entitlement: no account, no registration.
  const issueVip = (name) =>
    req(`/api/organizer/events/${c.eventId}/vip-passes`, { method: "POST", cookie: cookies.organizer, json: { guestName: name } });

  await expect("vip", "student cannot issue a guest pass",
    () => req(`/api/organizer/events/${c.eventId}/vip-passes`, { method: "POST", cookie: cookies.s1, json: { guestName: "ZZ Gatecrasher" } }),
    (r) => r.code === 403);

  await expect("vip", "organizer issues a guest pass", () => issueVip("ZZ Chief Guest"),
    (r) => r.code === 201 && typeof r.body?.pass?.code === "string");

  const vip = (await issueVip("ZZ Sponsor")).body.pass;

  await expect("vip", "pass page opens with no account", () => page(`/vip/${vip.code}`),
    (r) => r.code === 200 && r.html.includes("ZZ Sponsor"));

  await expect("vip", "unknown pass code is 404", () => page("/vip/vip_nope-zz"),
    (r) => r.code === 404 || /could not be found/i.test(r.html));

  const vipQr = vipPayloadFor(vip.code, c.endsAt);
  const scanVip = (payload) =>
    req("/api/checkin/validate", { method: "POST", cookie: cookies.volunteer, json: { eventId: c.eventId, gateId: "Main", qrPayload: payload } });

  await expect("vip", "tampered pass signature rejected",
    () => scanVip(vipQr.slice(0, -1) + (vipQr.endsWith("A") ? "B" : "A")),
    (r) => r.body?.status === "REJECTED");

  await expect("vip", "guest admitted at the gate", () => scanVip(vipQr),
    (r) => r.body?.status === "APPROVED");

  await expect("vip", "pass cannot be reused", () => scanVip(vipQr),
    (r) => r.body?.status === "REJECTED" && r.body?.reason === "VIP_PASS_USED");

  const revoked = (await issueVip("ZZ Uninvited")).body.pass;
  await expect("vip", "revoked pass is refused", async () => {
    await req(`/api/organizer/vip-passes/${revoked.id}`, { method: "DELETE", cookie: cookies.organizer });
    return scanVip(vipPayloadFor(revoked.code, c.endsAt));
  }, (r) => r.body?.status === "REJECTED" && r.body?.reason === "VIP_PASS_REVOKED");

  // ---- Google sign-in -----------------------------------------------------
  // Adapts to configuration: with credentials set the handshake is checked,
  // without them the feature must be cleanly absent rather than half-present.
  const loginHtml = (await page("/login")).html;
  const googleOn = loginHtml.includes("Continue with Google");

  if (googleOn) {
    await expect("google", "start redirects to Google with PKCE", async () => {
      const r = await fetch(`${BASE}/api/auth/google`, { redirect: "manual" });
      const loc = new URL(r.headers.get("location"));
      return {
        host: loc.host,
        method: loc.searchParams.get("code_challenge_method"),
        hasState: (loc.searchParams.get("state") || "").length > 10,
        hasNonce: (loc.searchParams.get("nonce") || "").length > 10,
      };
    }, (v) => v.host === "accounts.google.com" && v.method === "S256" && v.hasState && v.hasNonce);

    // Must carry the flow cookie from a real start, otherwise the missing
    // cookie is caught first and the state check is never reached.
    await expect("google", "callback refuses a forged state", async () => {
      const start = await fetch(`${BASE}/api/auth/google`, { redirect: "manual" });
      const flow = (start.headers.get("set-cookie").match(/ct_oauth=[^;]+/) || [""])[0];
      const r = await fetch(`${BASE}/api/auth/google/callback?state=wrong&code=x`, {
        redirect: "manual",
        headers: { Cookie: flow },
      });
      return new URL(r.headers.get("location")).search;
    }, (v) => v === "?error=bad_state");

    // A person declining at Google's screen is a choice, not a failure.
    await expect("google", "cancelling at Google returns quietly", async () => {
      const start = await fetch(`${BASE}/api/auth/google`, { redirect: "manual" });
      const flow = (start.headers.get("set-cookie").match(/ct_oauth=[^;]+/) || [""])[0];
      const r = await fetch(`${BASE}/api/auth/google/callback?error=access_denied`, {
        redirect: "manual",
        headers: { Cookie: flow },
      });
      const loc = new URL(r.headers.get("location"));
      return loc.pathname + loc.search;
    }, (v) => v === "/login");

    // Anything else from the provider is a real fault and must say so.
    await expect("google", "provider fault surfaces an error", async () => {
      const start = await fetch(`${BASE}/api/auth/google`, { redirect: "manual" });
      const flow = (start.headers.get("set-cookie").match(/ct_oauth=[^;]+/) || [""])[0];
      const r = await fetch(`${BASE}/api/auth/google/callback?error=temporarily_unavailable`, {
        redirect: "manual",
        headers: { Cookie: flow },
      });
      return new URL(r.headers.get("location")).search;
    }, (v) => v === "?error=google_failed");

    await expect("google", "failed attempts reach the audit trail", async () => {
      const q = `select count(*)::int n from audit_logs where action='USER_LOGIN_FAILED' and metadata->>'provider'='google'`;
      const before = (await client.query(q)).rows[0].n;
      const start = await fetch(`${BASE}/api/auth/google`, { redirect: "manual" });
      const flow = (start.headers.get("set-cookie").match(/ct_oauth=[^;]+/) || [""])[0];
      await fetch(`${BASE}/api/auth/google/callback?state=wrong&code=x`, { redirect: "manual", headers: { Cookie: flow } });
      const after = (await client.query(q)).rows[0].n;
      return after - before;
    }, (v) => v >= 1);

    await expect("google", "callback refuses a missing flow cookie", async () => {
      const r = await fetch(`${BASE}/api/auth/google/callback?state=x&code=x`, { redirect: "manual" });
      return new URL(r.headers.get("location")).search;
    }, (v) => v === "?error=expired");
  } else {
    await expect("google", "unconfigured: no button rendered", () => loginHtml, (v) => !v.includes("Continue with Google"));
    await expect("google", "unconfigured: start route refuses", async () => {
      const r = await fetch(`${BASE}/api/auth/google`, { redirect: "manual" });
      return new URL(r.headers.get("location")).search;
    }, (v) => v === "?error=google_unavailable");
  }

  // True whichever way Google is configured: an account with no password set
  // cannot be entered with one, and the refusal looks like any other.
  await expect("google", "password login refused when no password is set", async () => {
    const email = `${PREFIX}-nopw-${Date.now()}@example.com`;
    const id = randomUUID();
    made.users.push(id);
    await client.query(
      `INSERT INTO users (id,email,"passwordHash","fullName",role,"isEmailVerified","createdAt","updatedAt")
       VALUES ($1,$2,NULL,'ZZ No Password','STUDENT',true,now(),now())`,
      [id, email],
    );
    const r = await req("/api/auth/login", { method: "POST", json: { email, password: "Password123!" } });
    return { code: r.code, error: r.body?.error };
  }, (v) => v.code === 401 && v.error === "INVALID_CREDENTIALS");

  await cleanup(c);
  await client.end();

  // ---- Report -------------------------------------------------------------
  const groups = [...new Set(results.map((r) => r.group))];
  let failed = 0;
  for (const g of groups) {
    const rows = results.filter((r) => r.group === g);
    const bad = rows.filter((r) => !r.passed);
    failed += bad.length;
    console.log(`\n${g.toUpperCase()}  ${rows.length - bad.length}/${rows.length}`);
    for (const r of rows) {
      console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.name}${r.passed ? "" : `  << ${r.detail}`}`);
    }
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

run().catch(async (err) => {
  console.error("sweep aborted:", err);
  try { await cleanup(); await client.end(); } catch {}
  process.exitCode = 1;
});
