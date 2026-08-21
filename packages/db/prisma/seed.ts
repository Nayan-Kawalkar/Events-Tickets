import { randomBytes } from "node:crypto";
import { PrismaClient, Role, EventStatus, TicketStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

function ticketPublicId() {
  return `tkt_${randomBytes(16).toString("base64url")}`;
}

function daysFromNow(days: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed a production database.");
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.edu" },
    update: {},
    create: {
      email: "admin@example.edu",
      passwordHash,
      fullName: "Priya Nair",
      department: "Administration",
      role: Role.ADMIN,
      isEmailVerified: true,
    },
  });

  const organizer = await prisma.user.upsert({
    where: { email: "organizer@example.edu" },
    update: {},
    create: {
      email: "organizer@example.edu",
      passwordHash,
      fullName: "Rahul Verma",
      department: "Cultural Committee",
      role: Role.ORGANIZER,
      isEmailVerified: true,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@example.edu" },
    update: {},
    create: {
      email: "student@example.edu",
      passwordHash,
      fullName: "Aarav Sharma",
      rollNumber: "CS2026-104",
      department: "Computer Science",
      role: Role.STUDENT,
      isEmailVerified: true,
    },
  });

  const published = await prisma.event.upsert({
    where: { slug: "annual-cultural-night-2026" },
    update: {},
    create: {
      title: "Annual Cultural Night 2026",
      slug: "annual-cultural-night-2026",
      description:
        "An evening of music, dance and drama by student clubs. Doors open at 5:30 PM. Bring your college ID.",
      venue: "Main Auditorium",
      startsAt: daysFromNow(21, 18),
      endsAt: daysFromNow(21, 22),
      registrationOpensAt: daysFromNow(-2),
      registrationClosesAt: daysFromNow(20),
      status: EventStatus.PUBLISHED,
      capacity: 500,
      createdById: organizer.id,
      ticketTypes: {
        create: [
          {
            name: "Student Pass",
            description: "Free entry for enrolled students.",
            pricePaise: 0,
            capacity: 400,
            requiresStudentId: true,
            transferable: false,
            maxPerUser: 1,
          },
          {
            name: "Guest Pass",
            description: "For family and guests accompanying a student.",
            pricePaise: 15000,
            capacity: 100,
            requiresStudentId: false,
            transferable: true,
            maxPerUser: 2,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });

  await prisma.event.upsert({
    where: { slug: "tech-symposium-2026" },
    update: {},
    create: {
      title: "Tech Symposium 2026",
      slug: "tech-symposium-2026",
      description: "Talks and demos from the engineering departments. Draft — not yet published.",
      venue: "Seminar Hall B",
      startsAt: daysFromNow(45, 9),
      endsAt: daysFromNow(45, 17),
      status: EventStatus.DRAFT,
      capacity: 200,
      createdById: organizer.id,
      ticketTypes: {
        create: [
          {
            name: "Delegate Pass",
            pricePaise: 0,
            capacity: 200,
            requiresStudentId: true,
            maxPerUser: 1,
          },
        ],
      },
    },
  });

  // One demo ticket so the "My Tickets" and attendee list screens are not empty.
  const studentPass =
    published.ticketTypes.find((t) => t.name === "Student Pass") ?? published.ticketTypes[0];

  const existing = await prisma.ticket.findFirst({
    where: { eventId: published.id, ownerUserId: student.id },
  });

  if (!existing) {
    await prisma.ticket.create({
      data: {
        publicId: ticketPublicId(),
        eventId: published.id,
        ticketTypeId: studentPass.id,
        ownerUserId: student.id,
        status: TicketStatus.ISSUED,
      },
    });
  }

  console.log("Seed complete. Demo accounts (password: %s):", DEMO_PASSWORD);
  console.table([
    { role: "ADMIN", email: admin.email },
    { role: "ORGANIZER", email: organizer.email },
    { role: "STUDENT", email: student.email },
  ]);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
