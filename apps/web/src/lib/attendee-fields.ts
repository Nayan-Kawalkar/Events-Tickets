import { CustomFieldType, FieldMode } from "./enums";

/**
 * What a registration form asks for, and whether the answers are acceptable.
 *
 * Deliberately shared by the client and the server. The form renders from this
 * description and the API validates against the same description, so a field
 * cannot be required in the browser but ignored on the server — which is the
 * usual way a "custom form" feature ends up collecting nothing.
 *
 * Nothing here imports `@ct/db`, so the registration form can use it directly.
 */

/** Built-in fields an organizer can switch on or off per ticket type. */
export type BuiltInKey = "attendeePhone" | "attendeeRollNumber" | "attendeeDepartment";

export type CustomFieldSpec = {
  id: string;
  label: string;
  helpText: string | null;
  placeholder: string | null;
  type: CustomFieldType;
  required: boolean;
  options: string[];
};

export type FormSpec = {
  phoneMode: FieldMode;
  rollNumberMode: FieldMode;
  departmentMode: FieldMode;
  customFields: CustomFieldSpec[];
};

export const BUILT_IN_LABELS: Record<BuiltInKey, string> = {
  attendeePhone: "Phone number",
  attendeeRollNumber: "Roll number",
  attendeeDepartment: "Department",
};

/** Longest answer we will store, per field. Keeps one entry from bloating a row. */
export const MAX_ANSWER_LENGTH = 500;
export const MAX_CUSTOM_FIELDS = 20;

/** How several picks are joined into one stored answer. */
export const MULTI_SEPARATOR = ", ";

/** Types whose answers come from an organizer-defined option list. */
export function hasOptions(type: CustomFieldType) {
  return (
    type === CustomFieldType.SELECT ||
    type === CustomFieldType.RADIO ||
    type === CustomFieldType.MULTI_SELECT
  );
}

export function builtInMode(spec: FormSpec, key: BuiltInKey): FieldMode {
  if (key === "attendeePhone") return spec.phoneMode;
  if (key === "attendeeRollNumber") return spec.rollNumberMode;
  return spec.departmentMode;
}

export function isShown(mode: FieldMode) {
  return mode !== FieldMode.HIDDEN;
}

export function isRequired(mode: FieldMode) {
  return mode === FieldMode.REQUIRED;
}

/** The built-in fields this form actually shows, in display order. */
export function shownBuiltIns(spec: FormSpec): { key: BuiltInKey; required: boolean }[] {
  const keys: BuiltInKey[] = ["attendeePhone", "attendeeRollNumber", "attendeeDepartment"];
  return keys
    .filter((k) => isShown(builtInMode(spec, k)))
    .map((k) => ({ key: k, required: isRequired(builtInMode(spec, k)) }));
}

export type AnswerMap = Record<string, string>;
export type FieldErrors = Record<string, string>;

function digitsOnly(value: string) {
  return value.replace(/[^0-9]/g, "");
}

/**
 * Validate the built-in fields against the organizer's chosen modes.
 *
 * A hidden field is not merely skipped — whatever arrived for it is discarded,
 * so a crafted request cannot store data the organizer chose not to ask for.
 */
export function validateBuiltIns(
  spec: FormSpec,
  input: Partial<Record<BuiltInKey, string>>,
): { ok: true; values: Record<BuiltInKey, string | null> } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const values: Record<BuiltInKey, string | null> = {
    attendeePhone: null,
    attendeeRollNumber: null,
    attendeeDepartment: null,
  };

  for (const key of ["attendeePhone", "attendeeRollNumber", "attendeeDepartment"] as BuiltInKey[]) {
    const mode = builtInMode(spec, key);
    if (mode === FieldMode.HIDDEN) continue;

    const raw = (input[key] ?? "").trim();

    if (!raw) {
      if (mode === FieldMode.REQUIRED) errors[key] = `${BUILT_IN_LABELS[key]} is required`;
      continue;
    }

    if (key === "attendeePhone") {
      // Accept the shapes people actually type — spaces, dashes, +91 — and
      // judge the digits, not the punctuation.
      const digits = digitsOnly(raw);
      if (digits.length < 7 || digits.length > 15) {
        errors[key] = "Enter a valid phone number";
        continue;
      }
    }

    if (raw.length > MAX_ANSWER_LENGTH) {
      errors[key] = `${BUILT_IN_LABELS[key]} is too long`;
      continue;
    }

    values[key] = raw;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/**
 * Validate answers to the organizer's own questions.
 *
 * Answers are keyed by field id and only known ids are kept, so a request
 * carrying extra keys cannot smuggle arbitrary data onto the ticket.
 */
export function validateCustomAnswers(
  fields: CustomFieldSpec[],
  input: Record<string, unknown>,
): { ok: true; answers: AnswerMap } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const answers: AnswerMap = {};

  for (const field of fields) {
    const rawValue = input[field.id];
    const raw = typeof rawValue === "string" ? rawValue.trim() : rawValue == null ? "" : String(rawValue).trim();

    if (field.type === CustomFieldType.CHECKBOX) {
      // A required checkbox means "you must tick this" — a consent box, not a
      // question with two valid answers.
      const ticked = raw === "true" || raw === "on" || raw === "yes";
      if (field.required && !ticked) {
        errors[field.id] = `${field.label} is required`;
        continue;
      }
      answers[field.id] = ticked ? "Yes" : "No";
      continue;
    }

    if (!raw) {
      if (field.required) errors[field.id] = `${field.label} is required`;
      continue;
    }

    if (raw.length > MAX_ANSWER_LENGTH) {
      errors[field.id] = `${field.label} is too long`;
      continue;
    }

    if (field.type === CustomFieldType.NUMBER && !/^-?\d+(\.\d+)?$/.test(raw)) {
      errors[field.id] = `${field.label} must be a number`;
      continue;
    }

    // Trusting the posted value would let anyone write their own option, so
    // every choice is checked against the list the organizer defined.
    if (field.type === CustomFieldType.SELECT || field.type === CustomFieldType.RADIO) {
      if (!field.options.includes(raw)) {
        errors[field.id] = `Choose one of the listed options for ${field.label}`;
        continue;
      }
    }

    if (field.type === CustomFieldType.MULTI_SELECT) {
      // Several answers arrive as one string; each has to stand on its own.
      const picked = raw.split(MULTI_SEPARATOR).map((v) => v.trim()).filter(Boolean);
      if (picked.some((v) => !field.options.includes(v))) {
        errors[field.id] = `Choose from the listed options for ${field.label}`;
        continue;
      }
      if (field.required && picked.length === 0) {
        errors[field.id] = `${field.label} is required`;
        continue;
      }
      answers[field.id] = picked.join(MULTI_SEPARATOR);
      continue;
    }

    answers[field.id] = raw;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

/**
 * Answers as stored, turned back into label/value pairs for display and export.
 *
 * Reads labels from the questions as they are *now*, but falls back to the
 * label recorded with the answer, so a deleted question still shows something
 * meaningful on an old ticket rather than a bare uuid.
 */
export type StoredAnswer = { label: string; value: string };

export function storedAnswers(value: unknown): StoredAnswer[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const out: StoredAnswer[] = [];
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (entry && typeof entry === "object" && "label" in entry && "value" in entry) {
      const e = entry as { label: unknown; value: unknown };
      if (typeof e.label === "string" && typeof e.value === "string") {
        out.push({ label: e.label, value: e.value });
      }
    }
  }
  return out;
}

/** Pair each answer with its question's label at the moment it was given. */
export function labelAnswers(fields: CustomFieldSpec[], answers: AnswerMap) {
  const out: Record<string, StoredAnswer> = {};
  for (const field of fields) {
    const value = answers[field.id];
    if (value === undefined) continue;
    out[field.id] = { label: field.label, value };
  }
  return out;
}
