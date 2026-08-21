import { z } from "zod";
import { EventStatus, PaymentMode } from "./enums";

export { slugify } from "./slug";

/** Shared server-side validation. Client forms are a convenience, never a gate. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Password is too long")
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
    message: "Include at least one letter and one number",
  });

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    rollNumber: z.string().trim().max(40).optional().or(z.literal("")),
    department: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, "Enter your password").max(200),
  })
  .strict();

/** URL-safe slug: lowercase letters, digits and single hyphens. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Slug must be at least 3 characters")
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");

/** Accepts a datetime-local value ("2026-09-01T18:00") or a full ISO string. */
const dateTimeSchema = z.coerce.date({
  errorMap: () => ({ message: "Enter a valid date and time" }),
});

/** Empty string, null and "absent" all mean "no value". */
const optionalDateTime = z
  .union([dateTimeSchema, z.literal("").transform(() => null), z.null()])
  .optional()
  .transform((v) => v ?? null);

const optionalCapacity = z
  .union([
    z.coerce.number().int().positive("Capacity must be at least 1").max(1_000_000),
    z.literal("").transform(() => null),
    z.null(),
  ])
  .optional()
  .transform((v) => v ?? null);

const eventFields = {
  title: z.string().trim().min(3, "Enter an event title").max(160),
  slug: slugSchema,
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  venue: z.string().trim().max(200).optional().or(z.literal("")),
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  registrationOpensAt: optionalDateTime,
  registrationClosesAt: optionalDateTime,
  status: z.nativeEnum(EventStatus),
  capacity: optionalCapacity,
};

/** Cross-field date rules shared by create and update. */
function refineEventDates<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine((v: any) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, {
      message: "End time must be after the start time",
      path: ["endsAt"],
    })
    .refine(
      (v: any) =>
        !v.registrationOpensAt || !v.registrationClosesAt || v.registrationClosesAt > v.registrationOpensAt,
      { message: "Registration must close after it opens", path: ["registrationClosesAt"] },
    )
    .refine((v: any) => !v.registrationClosesAt || !v.endsAt || v.registrationClosesAt <= v.endsAt, {
      message: "Registration cannot close after the event ends",
      path: ["registrationClosesAt"],
    });
}

export const createEventSchema = refineEventDates(z.object(eventFields).strict());

export const updateEventSchema = refineEventDates(
  z.object(eventFields).strict().partial().refine((v) => Object.keys(v).length > 0, {
    message: "No changes supplied",
  }) as unknown as z.ZodObject<any>,
);

export const eventStatusSchema = z.object({ status: z.nativeEnum(EventStatus) }).strict();

const ticketTypeFields = {
  name: z.string().trim().min(2, "Enter a ticket type name").max(80),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  pricePaise: z.coerce
    .number()
    .int("Price must be a whole number of paise")
    .min(0, "Price cannot be negative")
    .max(10_000_000, "Price is too high"),
  capacity: optionalCapacity,
  salesStartAt: optionalDateTime,
  salesEndAt: optionalDateTime,
  requiresStudentId: z.coerce.boolean(),
  transferable: z.coerce.boolean(),
  maxPerUser: z.coerce.number().int().min(1, "At least 1").max(20, "At most 20"),
  paymentMode: z.nativeEnum(PaymentMode),
  organizerUpiId: z
    .string()
    .trim()
    .max(120)
    .regex(/^$|^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/, "Enter a valid UPI ID, e.g. name@bank")
    .optional()
    .or(z.literal("")),
  organizerUpiName: z.string().trim().max(120).optional().or(z.literal("")),
  organizerUpiQrUploadId: z.string().uuid().optional().or(z.literal("")).or(z.null()),
};

function refineSalesWindow<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine((v: any) => !v.salesStartAt || !v.salesEndAt || v.salesEndAt > v.salesStartAt, {
      message: "Sales must end after they start",
      path: ["salesEndAt"],
    })
    // A manual-UPI ticket cannot collect money without somewhere to send it.
    .refine((v: any) => v.paymentMode !== PaymentMode.MANUAL_UPI || Boolean(v.organizerUpiId), {
      message: "A UPI ID is required for manual UPI payment",
      path: ["organizerUpiId"],
    })
    .refine((v: any) => v.paymentMode !== PaymentMode.MANUAL_UPI || (v.pricePaise ?? 0) > 0, {
      message: "Manual UPI is for paid tickets. Set a price above zero.",
      path: ["pricePaise"],
    });
}

export const createTicketTypeSchema = refineSalesWindow(z.object(ticketTypeFields).strict());

export const updateTicketTypeSchema = refineSalesWindow(
  z.object(ticketTypeFields).strict().partial().refine((v) => Object.keys(v).length > 0, {
    message: "No changes supplied",
  }) as unknown as z.ZodObject<any>,
);

export const uuidSchema = z.string().uuid("Invalid identifier");

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>;
