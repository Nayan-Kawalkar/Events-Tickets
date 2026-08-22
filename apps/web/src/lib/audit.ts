import "server-only";
import { prisma } from "@ct/db";
import { clientIp } from "./rate-limit";

export type AuditAction =
  | "USER_REGISTERED"
  | "USER_LOGIN_SUCCEEDED"
  | "USER_LOGIN_FAILED"
  | "USER_LOGGED_OUT"
  | "EVENT_CREATED"
  | "EVENT_UPDATED"
  | "EVENT_STATUS_CHANGED"
  | "TICKET_TYPE_CREATED"
  | "TICKET_TYPE_UPDATED"
  | "TICKET_TYPE_DELETED"
  | "ATTENDEES_EXPORTED"
  | "TICKET_ISSUED"
  | "REGISTRATION_REJECTED"
  | "MANUAL_PAYMENT_SUBMITTED"
  | "MANUAL_PAYMENT_REJECTED_AT_SUBMIT"
  | "MANUAL_PAYMENT_VERIFIED"
  | "MANUAL_PAYMENT_REJECTED"
  | "UPI_QR_UPLOADED"
  | "EVENT_POSTER_UPLOADED"
  | "ADMIN_USER_CREATED"
  | "ADMIN_USER_ROLE_CHANGED"
  | "ADMIN_USER_DELETED"
  | "ADMIN_USER_PASSWORD_RESET"
  | "ADMIN_EVENT_STATUS_CHANGED"
  | "ADMIN_EVENT_DELETED"
  | "ADMIN_TICKET_BLOCKED"
  | "ADMIN_TICKET_CANCELLED"
  | "ADMIN_TICKET_REINSTATED"
  | "ADMIN_TICKET_REISSUED"
  | "MANUAL_CHECKIN"
  | "SUPER_PASS_ISSUED"
  | "SUPER_PASS_REVOKED"
  | "SCANNER_ASSIGNED"
  | "SCANNER_REVOKED";

/**
 * Append an immutable audit record. Never throws — a logging failure must not
 * roll back the action the user asked for.
 */
export async function audit(params: {
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        metadata: (params.metadata ?? {}) as object,
        ip: await clientIp(),
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", { action: params.action, err });
  }
}
