import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { browserPasskeys, type Passkeys } from "../../lib/decide.js";
import { api } from "../../api/client.js";
import type {
  PreparationContent,
  PreparationView,
  ResolutionRequest,
  WorkPackage,
} from "../../api/types.js";
import { Text, Select, Line, itemId } from "./fields.js";
import { RequirementsEditor } from "./RequirementsEditor.js";
import { TechnicalPlanEditor } from "./TechnicalPlanEditor.js";
import { QuestionList } from "./QuestionList.js";
function content(s: PreparationView["snapshot"]): PreparationContent {
  const {
    request_kind,
    package_contract,
    requirements,
    criteria,
    context,
    questions,
    resolutions,
    escalations,
    technical_plan,
    basis,
  } = structuredClone(s);
  return {
    request_kind,
    package_contract,
    requirements,
    criteria,
    context,
    questions,
    resolutions,
    escalations,
    technical_plan,
    basis,
  };
}
export function PreparationPanel({
  pkg,
  enabled,
  enrolled,
  passkeys = browserPasskeys,
}: {
  pkg: WorkPackage;
  enabled: boolean;
  enrolled: boolean;
  passkeys?: Passkeys;
}) {
  const qc = useQueryClient(),
    key = ["preparation", pkg.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.preparation(pkg.id),
    enabled: enrolled,
  });
  const [draft, setDraft] = useState<PreparationContent | null>(null),
    [etag, setEtag] = useState(""),
    [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [history, setHistory] = useState<PreparationView[] | null>(null),
    [before, setBefore] = useState<number | undefined>();
  const [comparison, setComparison] = useState<PreparationView | null>(null);
  useEffect(() => {
    if (q.data && !dirty) {
      setDraft(content(q.data.snapshot));
      setEtag(`"${q.data.content_digest.value}"`);
    }
  }, [q.data, dirty]);
  function change(fn: (d: PreparationContent) => void) {
    setDraft((prev) => {
      if (!prev) return prev;
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
    setDirty(true);
    setError(null);
  }
  async function perform(action: () => Promise<PreparationView>) {
    setBusy(true);
    setError(null);
    try {
      const v = await action();
      setDirty(false);
      setDraft(content(v.snapshot));
      setEtag(`"${v.content_digest.value}"`);
      qc.setQueryData(key, v);
      setComparison(null);
      setHistory(null);
      void qc.invalidateQueries({ queryKey: ["package", pkg.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preparation was not saved");
      if (enrolled) {
        try {
          setComparison(await api.preparation(pkg.id));
        } catch {
          /* retain local draft */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    try {
      const v = await api.preparation(pkg.id);
      setDirty(false);
      setDraft(content(v.snapshot));
      setEtag(`"${v.content_digest.value}"`);
      qc.setQueryData(key, v);
      setComparison(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reload");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!q.data || dirty) return;
    setBusy(true);
    setError(null);
    try {
      const shown = q.data.requirements_digest;
      const options = await api.preparationConfirmationOptions(pkg.id, shown);
      if (
        options.requirements_digest.algorithm !== shown.algorithm ||
        options.requirements_digest.value !== shown.value
      )
        throw new Error(
          "Requirements changed. Reload and review before signing.",
        );
      await api.confirmPreparation(pkg.id, await passkeys.get(options.options));
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Requirements were not confirmed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory(cursor?: number) {
    try {
      const v = await api.preparationHistory(pkg.id, cursor);
      setHistory((prev) =>
        cursor === undefined ? v.revisions : [...(prev ?? []), ...v.revisions],
      );
      setBefore(v.next_before);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    }
  }
  if (!enrolled)
    return enabled && pkg.status === "draft" ? (
      <section className="panel">
        <h2>Guided preparation</h2>
        <p>
          Build a controlled requirements and technical plan before release.
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() =>
            void perform(() =>
              api.enrollPreparation(
                pkg.id,
                pkg.revision,
                `manual-${pkg.id.slice(0, 70)}-${pkg.revision}`,
              ),
            )
          }
        >
          Start guided preparation
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    ) : null;
  if (q.isLoading || !draft)
    return (
      <section className="panel">
        <h2>Guided preparation</h2>
        {q.isError ? (
          <p role="alert">
            Could not load preparation.{" "}
            <button onClick={() => void q.refetch()}>Retry</button>
          </p>
        ) : (
          <p>Loading preparation…</p>
        )}
      </section>
    );
  const v = q.data;
  const resolve = (r: ResolutionRequest) =>
    void perform(() => api.resolvePreparation(pkg.id, etag, r));
  return (
    <section className="panel preparation" aria-labelledby="preparation-title">
      <h2 id="preparation-title">Guided preparation</h2>
      <p>
        {v?.confirmed ? "Requirements confirmed" : "Requirements not confirmed"}{" "}
        · revision {v?.snapshot.revision} ·{" "}
        {dirty ? "Unsaved changes" : "Saved"}
      </p>
      {pkg.status === "draft" && !v?.confirmed && (
        <button
          type="button"
          className="btn primary"
          disabled={dirty || busy}
          onClick={() => void confirm()}
        >
          Confirm requirements with passkey
        </button>
      )}
      <p className="muted small">
        Preparation records intent and review. Mapped checks do not represent
        passing verification.
      </p>
      <ul aria-label="Preparation blockers">
        {v?.blockers.map((b, i) => (
          <li key={`${b.code}-${i}`}>
            {b.owner}: {b.message}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {comparison && (
        <aside>
          <p>
            Saved revision {comparison.snapshot.revision}:{" "}
            {comparison.snapshot.context.problem}
          </p>
          <p>
            Your local edits are retained. Reloading replaces them with the
            saved revision.
          </p>
        </aside>
      )}
      <fieldset
        disabled={busy || pkg.status !== "draft"}
        className="prep-fields"
      >
        <legend>Requirements and technical preparation</legend>
        <Select
          label="Request kind"
          value={draft.request_kind}
          change={(kind) =>
            change((d) => {
              d.request_kind = kind as PreparationContent["request_kind"];
            })
          }
        >
          {["general", "bugfix", "enhancement", "capital-projects"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </Select>
        <Text
          label="Problem or need"
          value={draft.context.problem}
          change={(value) =>
            change((d) => {
              d.context.problem = value;
            })
          }
        />
        {draft.request_kind === "bugfix" &&
          (
            [
              ["repro", "Reproduction steps"],
              ["expected", "Expected behavior"],
              ["actual", "Actual behavior"],
              ["environment", "Environment"],
            ] as const
          ).map(([key, label]) => (
            <Text
              key={key}
              label={label}
              value={draft.context[key] ?? ""}
              change={(value) =>
                change((d) => {
                  d.context[key] = value;
                })
              }
            />
          ))}
        {draft.request_kind === "enhancement" &&
          (
            [
              ["current_journey", "Current journey"],
              ["desired_journey", "Desired journey"],
            ] as const
          ).map(([key, label]) => (
            <Text
              key={key}
              label={label}
              value={draft.context[key] ?? ""}
              change={(value) =>
                change((d) => {
                  d.context[key] = value;
                })
              }
            />
          ))}
        <Text
          label="Implementation suggestions (nonbinding)"
          value={draft.context.implementation_notes ?? ""}
          change={(value) =>
            change((d) => {
              d.context.implementation_notes = value;
            })
          }
        />
        <RequirementsEditor value={draft} change={change} />
        <QuestionList
          value={draft}
          change={change}
          resolve={resolve}
          dirty={dirty}
        />
        <TechnicalPlanEditor value={draft} change={change} />
        <h3>Controlled basis</h3>
        {draft.basis.map((b, i) => (
          <div className="prep-item" key={i}>
            <p>
              {b.kind}: {b.reference} · revision {b.revision}
            </p>
            <p className="mono small">{b.digest.value}</p>
            {b.kind === "repository" && (
              <>
                <Line
                  label={`Source ${i + 1} commit`}
                  value={b.commit ?? ""}
                  change={(v) =>
                    change((d) => {
                      d.basis[i]!.commit = v;
                    })
                  }
                />
                <Line
                  label={`Source ${i + 1} path`}
                  value={b.path ?? ""}
                  change={(v) =>
                    change((d) => {
                      d.basis[i]!.path = v;
                    })
                  }
                />
              </>
            )}
            <Line
              label={`Source ${i + 1} reference`}
              value={b.reference}
              change={(v) =>
                change((d) => {
                  d.basis[i]!.reference = v;
                })
              }
            />
            <Line
              label={`Source ${i + 1} revision`}
              value={b.revision}
              change={(v) =>
                change((d) => {
                  d.basis[i]!.revision = v;
                })
              }
            />
            <Line
              label={`Source ${i + 1} SHA-256 digest`}
              value={b.digest.value}
              change={(v) =>
                change((d) => {
                  d.basis[i]!.digest = { algorithm: "sha256", value: v };
                })
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="btn ghost small"
          onClick={() =>
            change((d) => {
              d.basis.push({
                kind: "repository",
                reference: itemId("source"),
                revision: "",
                commit: "",
                path: "",
                digest: { algorithm: "sha256", value: "" },
              });
            })
          }
        >
          Add repository source
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!dirty}
          onClick={() =>
            void perform(() => api.savePreparation(pkg.id, etag, draft))
          }
        >
          Save preparation
        </button>
      </fieldset>
      <button
        type="button"
        className="btn ghost small"
        disabled={busy}
        onClick={() => void reload()}
      >
        Reload saved preparation
      </button>
      <button
        type="button"
        className="btn ghost small"
        onClick={() => void loadHistory()}
      >
        Show preparation history
      </button>
      {history && (
        <ol aria-label="Preparation history">
          {history.map((r) => (
            <li key={r.snapshot.revision}>
              Revision {r.snapshot.revision} · {r.snapshot.created_by.id} ·{" "}
              {r.snapshot.created_at}
              <p>{r.snapshot.context.problem}</p>
              <p className="mono small">{r.content_digest.value}</p>
            </li>
          ))}
        </ol>
      )}
      {history && before !== undefined && (
        <button type="button" onClick={() => void loadHistory(before)}>
          Older preparation revisions
        </button>
      )}
    </section>
  );
}
