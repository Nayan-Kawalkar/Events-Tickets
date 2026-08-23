"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { CustomFieldType, FieldMode } from "@/lib/enums";
import { MAX_CUSTOM_FIELDS, hasOptions } from "@/lib/attendee-fields";
import { Field, Select, TextInput } from "./form";
import { Button, Card } from "./ui";
import { useToast } from "./toast";

export type EditableField = {
  id?: string;
  label: string;
  helpText: string;
  placeholder: string;
  type: CustomFieldType;
  required: boolean;
  options: string[];
};

export type FormConfig = {
  phoneMode: FieldMode;
  rollNumberMode: FieldMode;
  departmentMode: FieldMode;
  fields: EditableField[];
};

const MODE_LABELS: { value: FieldMode; label: string }[] = [
  { value: FieldMode.HIDDEN, label: "Don't ask" },
  { value: FieldMode.OPTIONAL, label: "Ask (optional)" },
  { value: FieldMode.REQUIRED, label: "Ask (required)" },
];

const TYPE_LABELS: { value: CustomFieldType; label: string }[] = [
  { value: CustomFieldType.SHORT_TEXT, label: "Short text" },
  { value: CustomFieldType.LONG_TEXT, label: "Paragraph" },
  { value: CustomFieldType.NUMBER, label: "Number" },
  { value: CustomFieldType.SELECT, label: "Dropdown (pick one)" },
  { value: CustomFieldType.RADIO, label: "Radio buttons (pick one)" },
  { value: CustomFieldType.MULTI_SELECT, label: "Checkboxes (pick several)" },
  { value: CustomFieldType.CHECKBOX, label: "Single tick box (yes/no)" },
];

const BUILT_INS = [
  { key: "phoneMode", label: "Phone number" },
  { key: "rollNumberMode", label: "Roll number" },
  { key: "departmentMode", label: "Department / class" },
] as const;

/**
 * What one ticket type asks its buyers.
 *
 * Two things are edited here and they save separately, because they live in
 * different places: the built-in modes are columns on the ticket type, while
 * the questions are their own rows. One button saves both in sequence so the
 * organizer never has to think about that split.
 */
export function RegistrationFormEditor({
  ticketTypeId,
  ticketTypeName,
  initial,
}: {
  ticketTypeId: string;
  ticketTypeName: string;
  initial: FormConfig;
}) {
  const router = useRouter();
  const toast = useToast();
  const [config, setConfig] = useState<FormConfig>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setMode(key: (typeof BUILT_INS)[number]["key"], value: FieldMode) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function setField(index: number, patch: Partial<EditableField>) {
    setConfig((c) => ({
      ...c,
      fields: c.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  }

  function addField() {
    setConfig((c) => ({
      ...c,
      fields: [
        ...c.fields,
        {
          label: "",
          helpText: "",
          placeholder: "",
          type: CustomFieldType.SHORT_TEXT,
          required: false,
          options: [],
        },
      ],
    }));
  }

  function setOption(fieldIndex: number, optionIndex: number, value: string) {
    setConfig((c) => ({
      ...c,
      fields: c.fields.map((f, i) =>
        i === fieldIndex
          ? { ...f, options: f.options.map((o, j) => (j === optionIndex ? value : o)) }
          : f,
      ),
    }));
  }

  function addOption(fieldIndex: number) {
    setConfig((c) => ({
      ...c,
      fields: c.fields.map((f, i) => (i === fieldIndex ? { ...f, options: [...f.options, ""] } : f)),
    }));
  }

  function removeOption(fieldIndex: number, optionIndex: number) {
    setConfig((c) => ({
      ...c,
      fields: c.fields.map((f, i) =>
        i === fieldIndex ? { ...f, options: f.options.filter((_, j) => j !== optionIndex) } : f,
      ),
    }));
  }

  /** Switching to a choice type with no options yet gets a blank row to fill. */
  function setType(index: number, type: CustomFieldType) {
    setConfig((c) => ({
      ...c,
      fields: c.fields.map((f, i) => {
        if (i !== index) return f;
        const options = hasOptions(type) && f.options.length === 0 ? [""] : f.options;
        return { ...f, type, options };
      }),
    }));
  }

  function removeField(index: number) {
    setConfig((c) => ({ ...c, fields: c.fields.filter((_, i) => i !== index) }));
  }

  function move(index: number, by: number) {
    setConfig((c) => {
      const next = [...c.fields];
      const target = index + by;
      if (target < 0 || target >= next.length) return c;
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row as EditableField);
      return { ...c, fields: next };
    });
  }

  async function save() {
    setError(null);

    // Caught here so a typo does not cost a round-trip and a generic message.
    const blank = config.fields.findIndex((f) => !f.label.trim());
    if (blank >= 0) {
      setError(`Question ${blank + 1} needs a label.`);
      return;
    }
    const emptyDropdown = config.fields.findIndex(
      (f) => hasOptions(f.type) && f.options.filter((o) => o.trim()).length === 0,
    );
    if (emptyDropdown >= 0) {
      setError(`Question ${emptyDropdown + 1} needs at least one option.`);
      return;
    }

    setPending(true);

    const modes = await apiRequest(`/api/organizer/ticket-types/${ticketTypeId}`, "PATCH", {
      phoneMode: config.phoneMode,
      rollNumberMode: config.rollNumberMode,
      departmentMode: config.departmentMode,
    });

    if (!modes.ok) {
      setPending(false);
      setError(modes.message);
      toast.push("error", modes.message);
      return;
    }

    const saved = await apiRequest<{ fields: { id: string }[] }>(
      `/api/organizer/ticket-types/${ticketTypeId}/fields`,
      "PUT",
      {
        fields: config.fields.map((f) => ({
          ...(f.id ? { id: f.id } : {}),
          label: f.label.trim(),
          helpText: f.helpText.trim(),
          placeholder: f.placeholder.trim(),
          type: f.type,
          required: f.required,
          options: hasOptions(f.type) ? f.options.map((o) => o.trim()).filter(Boolean) : [],
        })),
      },
    );

    setPending(false);

    if (!saved.ok) {
      setError(saved.message);
      toast.push("error", saved.message);
      return;
    }

    toast.push("success", "Registration form saved.");
    router.refresh();
  }

  return (
    <Card glow={false}>
      <div className="space-y-5">
        <div>
          <h3 className="text-eyebrow">Registration form — {ticketTypeName}</h3>
          <p className="mt-1.5 text-sm text-slate-600">
            Name and email are always collected. Everything else is up to you.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm font-medium text-red-300">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          {BUILT_INS.map(({ key, label }) => (
            <Field key={key} label={label} htmlFor={`${ticketTypeId}-${key}`}>
              <Select
                id={`${ticketTypeId}-${key}`}
                value={config[key]}
                onChange={(e) => setMode(key, e.target.value as FieldMode)}
              >
                {MODE_LABELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>

        <div className="border-t border-white/8 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium text-slate-800">Your own questions</h4>
            <Button
              variant="secondary"
              onClick={addField}
              disabled={pending || config.fields.length >= MAX_CUSTOM_FIELDS}
            >
              Add question
            </Button>
          </div>

          {config.fields.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No extra questions. Add one to collect anything else you need — t-shirt size,
              dietary needs, a consent tick.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {config.fields.map((field, index) => (
                <li key={field.id ?? `new-${index}`} className="rounded-xl border border-white/8 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={`Question ${index + 1}`} htmlFor={`${ticketTypeId}-label-${index}`}>
                      <TextInput
                        id={`${ticketTypeId}-label-${index}`}
                        value={field.label}
                        placeholder="T-shirt size"
                        onChange={(e) => setField(index, { label: e.target.value })}
                      />
                    </Field>

                    <Field label="Answer type" htmlFor={`${ticketTypeId}-type-${index}`}>
                      <Select
                        id={`${ticketTypeId}-type-${index}`}
                        value={field.type}
                        onChange={(e) => setType(index, e.target.value as CustomFieldType)}
                      >
                        {TYPE_LABELS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Help text"
                      htmlFor={`${ticketTypeId}-help-${index}`}
                      hint="Optional. Shown under the question."
                    >
                      <TextInput
                        id={`${ticketTypeId}-help-${index}`}
                        value={field.helpText}
                        onChange={(e) => setField(index, { helpText: e.target.value })}
                      />
                    </Field>

                    {/* A placeholder sits inside the empty box, so it only makes
                        sense where there is a box to type in. */}
                    {hasOptions(field.type) || field.type === CustomFieldType.CHECKBOX ? null : (
                      <Field
                        label="Placeholder"
                        htmlFor={`${ticketTypeId}-ph-${index}`}
                        hint="Optional. Example text shown in the empty box."
                      >
                        <TextInput
                          id={`${ticketTypeId}-ph-${index}`}
                          value={field.placeholder}
                          placeholder="e.g. Vegetarian"
                          onChange={(e) => setField(index, { placeholder: e.target.value })}
                        />
                      </Field>
                    )}
                  </div>

                  {hasOptions(field.type) ? (
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-800">Options</span>
                        <Button variant="secondary" onClick={() => addOption(index)} disabled={pending}>
                          Add option
                        </Button>
                      </div>

                      <ul className="space-y-2">
                        {field.options.map((option, optionIndex) => (
                          <li key={optionIndex} className="flex items-center gap-2">
                            <TextInput
                              id={`${ticketTypeId}-opt-${index}-${optionIndex}`}
                              value={option}
                              placeholder={`Option ${optionIndex + 1}`}
                              aria-label={`Option ${optionIndex + 1}`}
                              onChange={(e) => setOption(index, optionIndex, e.target.value)}
                            />
                            <Button
                              variant="secondary"
                              onClick={() => removeOption(index, optionIndex)}
                              // Never leave a choice question with nothing to choose.
                              disabled={pending || field.options.length <= 1}
                            >
                              Remove
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => setField(index, { required: e.target.checked })}
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                      />
                      Required
                    </label>

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => move(index, -1)}
                        disabled={pending || index === 0}
                      >
                        Up
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => move(index, 1)}
                        disabled={pending || index === config.fields.length - 1}
                      >
                        Down
                      </Button>
                      <Button variant="danger" onClick={() => removeField(index)} disabled={pending}>
                        Remove
                      </Button>
                    </div>
                  </div>

                  {field.id ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Removing this keeps answers already collected on existing tickets.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/8 pt-4">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save registration form"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
