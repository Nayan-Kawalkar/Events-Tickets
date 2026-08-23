import { z } from "zod";
import { prisma } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireManageableEvent, requireOrganizerApi } from "@/lib/organizer-guard";
import { generateVipCode } from "@/lib/vip-pass";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    guestName: z.string().trim().min(2, "Enter the guest's name").max(120),
    note: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .strict();

type Params = { params: Promise<{ eventId: string }> };

/** Issue a guest pass for this event. One pass, one guest, one entry. */
export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");

  const found = await requireManageableEvent(user, idResult.data);
  if (!found.ok) return found.response;
  const event = found.value;

  const parsed = await parseJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const pass = await prisma.vipPass.create({
      data: {
        eventId: event.id,
        code: generateVipCode(),
        guestName: parsed.data.guestName,
        note: parsed.data.note || null,
        createdByUserId: user.id,
      },
      select: { id: true, code: true, guestName: true },
    });

    await audit({
      actorUserId: user.id,
      entityType: "Event",
      entityId: event.id,
      action: "VIP_PASS_ISSUED",
      metadata: { guestName: pass.guestName, passId: pass.id },
    });

    return ok({ pass }, 201);
  } catch (err) {
    return serverError("issue vip pass", err);
  }
}
