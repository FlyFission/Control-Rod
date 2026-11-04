import { type ReactNode, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import type { ActionDescriptor } from "../../api/types.js";
import { type Passkeys, browserPasskeys, signAdmin } from "../../lib/decide.js";

/**
 * One administrative command as a form (plan task 5.4). The form states, in words, exactly what the
 * command will change before anything is sent; a directly signed command is signed with the person's
 * passkey over exactly the payload the form shows; a command the person may not run is shown with the
 * reason, never hidden; and the control plane's refusal is shown as it gives it.
 */

export type Values = Record<string, string | string[]>;

export type Field =
  | { key: string; label: string; kind: "text" | "textarea" | "date"; required?: boolean; hint?: string; placeholder?: string }
  | { key: string; label: string; kind: "select"; options: readonly { value: string; label: string }[]; required?: boolean; hint?: string }
  | { key: string; label: string; kind: "checks"; options: readonly { value: string; label: string }[]; required?: boolean; hint?: string }
  /** One entry per line, as a list of strings. */
  | { key: string; label: string; kind: "lines"; required?: boolean; hint?: string; placeholder?: string };

export interface CommandSpec {
  /** The command's catalogue name, for example member.suspend. */
  name: string;
  /** A heading of its own, where one command has two forms (setting a new budget, changing one). */
  title?: string;
  fields: readonly Field[];
  /** What the command will change, in words, from the values as they stand; null until they are complete. */
  describe: (v: Values) => string | null;
  /** Why these values cannot be sent as they stand (a combination the control plane refuses), or null. */
  invalid?: (v: Values) => string | null;
  /** Changes when what the form starts from changes (for example a new policy version), so it starts again. */
  resetKey?: string;
  /** The exact payload sent and signed; it must say nothing the description does not. */
  payload: (v: Values) => Record<string, unknown>;
  /** Words for a successful result, from what the control plane returned. */
  done?: (result: Record<string, unknown>, v: Values) => ReactNode;
  /** The verb on the button, after "Sign and". */
  verb: string;
  initial?: Values;
}

const empty = (spec: CommandSpec): Values =>
  ({ ...Object.fromEntries(spec.fields.map((f) => [f.key, f.kind === "checks" || f.kind === "lines" ? [] : ""])), ...spec.initial });

/** A field's value as a list, from its lines. */
export const linesOf = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

export function CommandForm({ spec, action, passkeys = browserPasskeys }: { spec: CommandSpec; action: ActionDescriptor | undefined; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  const id = useId();
  const [values, setValues] = useState<Values>(() => empty(spec));
  // Lines are kept as typed, starting from any initial list; the payload reads them as lists.
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.fields.filter((f) => f.kind === "lines").map((f) => {
      const start = spec.initial?.[f.key];
      return [f.key, Array.isArray(start) ? start.join("\n") : ""];
    })));
  const merged: Values = { ...values, ...Object.fromEntries(Object.entries(text).map(([k, t]) => [k, linesOf(t)])) };
  const missing = spec.fields.some((f) => f.required && (Array.isArray(merged[f.key]) ? (merged[f.key] as string[]).length === 0 : !String(merged[f.key] ?? "").trim()));
  // Every description ends with the reason the command records, since it is signed with the rest.
  const problem = missing ? null : (spec.invalid?.(merged) ?? null);
  const said = missing || problem ? null : spec.describe(merged);
  const reason = spec.fields.some((f) => f.key === "reason") ? String(merged["reason"] ?? "").trim() : "";
  const description = said && reason ? `${said} Recorded reason: ${reason}` : said;
  const signed = action?.signature === "direct";
  const run = useMutation({
    mutationFn: () => {
      const payload = spec.payload(merged);
      return signed ? signAdmin<Record<string, unknown>>(spec.name, payload, passkeys) : api.adminUnsigned<Record<string, unknown>>(spec.name, payload);
    },
    onSuccess: () => {
      for (const key of ["admin", "usage", "roster", "office-figures"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
  const allowed = action?.allowed === true;
  const set = (key: string, value: string | string[]) => {
    setValues((v) => ({ ...v, [key]: value }));
    run.reset();
  };
  return (
    <form
      className="admin-form"
      aria-labelledby={`${id}-title`}
      onSubmit={(e) => {
        e.preventDefault();
        if (description && allowed) run.mutate();
      }}
    >
      <h3 id={`${id}-title`}>{spec.title ?? action?.label ?? spec.name}</h3>
      {!allowed && (
        <p className="small">
          {action === undefined ? "Whether you may do this could not be loaded." : (action.reason ?? "This is not available to you.")}{" "}
          {action?.change !== undefined && <span className="muted">{action.change}</span>}
        </p>
      )}
      <fieldset disabled={!allowed || run.isPending}>
        {spec.fields.map((f) => (
          <FieldInput key={f.key} field={f} value={f.kind === "lines" ? (text[f.key] ?? "") : (values[f.key] ?? "")} onChange={(v) => (f.kind === "lines" ? (setText((t) => ({ ...t, [f.key]: v as string })), run.reset()) : set(f.key, v))} />
        ))}
        {/* What will change, in words, before anything is sent (N-3). */}
        <p className="small admin-describe" role="status">
          {problem ?? description ?? "Fill in the required fields to see exactly what this changes."}
        </p>
        <button type="submit" className="btn small" disabled={!description}>
          {run.isPending ? "Working" : signed ? `Sign with your passkey and ${spec.verb}` : spec.verb[0]!.toUpperCase() + spec.verb.slice(1)}
        </button>
      </fieldset>
      {run.error && (
        <p className="error" role="alert">
          {run.error.message}
        </p>
      )}
      {run.data && (
        <div className="ok small" role="status">
          {spec.done ? spec.done(run.data, merged) : "Done."}
        </div>
      )}
    </form>
  );
}

function FieldInput({ field: f, value, onChange }: { field: Field; value: string | string[]; onChange: (v: string | string[]) => void }) {
  const id = useId();
  const label = `${f.label}${f.required ? " (required)" : ""}`;
  if (f.kind === "checks") {
    const chosen = new Set(value as string[]);
    return (
      <fieldset className="admin-checks" aria-describedby={f.hint ? `${id}-hint` : undefined}>
        <legend>{label}</legend>
        {f.options.map((o) => (
          <label key={o.value} className="office-choice">
            <input
              type="checkbox"
              checked={chosen.has(o.value)}
              onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(o.value);
                else next.delete(o.value);
                onChange(f.options.map((x) => x.value).filter((x) => next.has(x)));
              }}
            />{" "}
            {o.label}
          </label>
        ))}
        {f.hint && (
          <p id={`${id}-hint`} className="muted small">
            {f.hint}
          </p>
        )}
      </fieldset>
    );
  }
  // The hint describes the control rather than naming it, so it sits outside the label.
  const hint = f.hint ? `${id}-hint` : undefined;
  const common = { "aria-describedby": hint, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        {f.kind === "select" ? (
          <select value={value as string} {...common}>
            <option value="">Choose</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : f.kind === "textarea" || f.kind === "lines" ? (
          <textarea rows={f.kind === "lines" ? 3 : 2} value={value as string} placeholder={"placeholder" in f ? f.placeholder : undefined} {...common} />
        ) : (
          <input type={f.kind === "date" ? "date" : "text"} value={value as string} placeholder={"placeholder" in f ? f.placeholder : undefined} {...common} />
        )}
      </label>
      {hint && (
        <span id={hint} className="muted small">
          {f.hint}
        </span>
      )}
    </div>
  );
}
