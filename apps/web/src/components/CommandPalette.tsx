import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ACCEPT_COMMANDS, ACCEPT_WAITS_FOR_VERIFICATION, blockUnverifiedAccept, isVerified, needsIndependentCheck } from "../lib/board.js";
import { api } from "../api/client.js";
import { type Command, buildCommands, filterCommands } from "../places/commands.js";
import { PLACES } from "../places/places.js";

const PACKAGE_PATH = /^\/packages\/([^/]+)$/;

/**
 * The command palette (specification 12; plan task 3.2). One shortcut opens it from anywhere; it
 * reaches every place, package and command available to the viewer. A command they may not take is
 * listed, marked, and explained instead of hidden.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const packageId = PACKAGE_PATH.exec(path)?.[1];
  const packages = useQuery({ queryKey: ["packages"], queryFn: api.packages, enabled: open });
  const admin = useQuery({ queryKey: ["admin"], queryFn: api.admin, enabled: open });
  const actions = useQuery({
    queryKey: ["actions", packageId],
    queryFn: () => api.packageActions(decodeURIComponent(packageId!)),
    enabled: open && packageId !== undefined,
  });
  // The same acceptance rule as the decision bar (ruling 16): no Accept on unverified Safety or
  // Material work. A package not yet known from the list is treated as unverified.
  const viewed = packageId !== undefined ? packages.data?.find((p) => p.id === decodeURIComponent(packageId)) : undefined;
  const verifications = useQuery({
    queryKey: ["person-verifications", viewed?.id],
    queryFn: () => api.personVerifications(viewed!.id),
    enabled: open && viewed !== undefined && needsIndependentCheck(viewed),
  });
  const packageActions = useMemo(() => {
    if (actions.data === undefined) return undefined;
    if (viewed === undefined) return actions.data.map((a) => (a.allowed && ACCEPT_COMMANDS.includes(a.command) ? { ...a, allowed: false, reason: ACCEPT_WAITS_FOR_VERIFICATION } : a));
    return blockUnverifiedAccept(viewed, actions.data, verifications.data ? isVerified(viewed, verifications.data) : false);
  }, [actions.data, viewed, verifications.data]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const listId = useId();

  const commands = useMemo(
    () =>
      buildCommands({
        places: PLACES,
        ...(packages.data ? { packages: packages.data } : {}),
        ...(packageId !== undefined ? { packageId: decodeURIComponent(packageId) } : {}),
        ...(packageActions ? { packageActions } : {}),
        ...(admin.data ? { adminActions: admin.data.actions } : {}),
      }),
    [packages.data, packageId, packageActions, admin.data],
  );
  const shown = useMemo(() => filterCommands(commands, query), [commands, query]);
  const current: Command | undefined = shown[Math.min(active, shown.length - 1)];

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActive(0);
    input.current?.focus();
    return () => returnTo.current?.focus();
  }, [open]);
  useEffect(() => setActive(0), [query]);
  // A modal keeps focus: anything that would move it outside the palette brings it back to the field.
  useEffect(() => {
    if (!open) return;
    const keep = (e: FocusEvent) => {
      if (dialog.current && e.target instanceof Node && !dialog.current.contains(e.target)) input.current?.focus();
    };
    document.addEventListener("focusin", keep);
    return () => document.removeEventListener("focusin", keep);
  }, [open]);
  useEffect(() => {
    if (current) document.getElementById(optionId(listId, current.id))?.scrollIntoView?.({ block: "nearest" });
  }, [current, listId]);

  if (!open) return null;

  function choose(c: Command | undefined) {
    if (!c) return;
    // A refused command does nothing; its reason and the fact that would change it are shown
    // below the list while it is active.
    if (!c.allowed) return;
    onClose();
    void navigate({ to: c.target.to, ...(c.target.params ? { params: c.target.params } : {}), ...(c.target.hash ? { hash: c.target.hash } : {}) } as never);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const last = shown.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (i >= last ? 0 : i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (i <= 0 ? Math.max(last, 0) : i - 1));
        break;
      case "Enter":
        e.preventDefault();
        choose(current);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "Tab":
        // The dialog holds focus on its one field while open.
        e.preventDefault();
        break;
    }
  }

  const loading = packages.isLoading || admin.isLoading || actions.isLoading;
  // Availability comes from the server; when it could not be fetched or refreshed, say so.
  const stale = admin.isError || actions.isError;
  let lastGroup = "";
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <input
          ref={input}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(listId, current.id) : undefined}
          aria-label="Search places, packages and commands"
          placeholder="Search places, packages and commands"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {stale && (
          <p className="palette-stale" role="status">
            What you may do could not be {admin.data !== undefined || actions.data !== undefined ? "refreshed; the marks below may be out of date" : "checked"}. The
            server decides again when you act.
          </p>
        )}
        <ul id={listId} role="listbox" className="palette-list" aria-label="Results">
          {shown.map((c) => {
            const heading = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const selected = c === current;
            return (
              <li key={c.id} role="presentation">
                {heading !== null && (
                  <div className="palette-group" role="presentation">
                    {heading}
                  </div>
                )}
                <div
                  id={optionId(listId, c.id)}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={!c.allowed}
                  className={`palette-option${selected ? " active" : ""}${c.allowed ? "" : " refused"}`}
                  onMouseMove={() => setActive(shown.indexOf(c))}
                  // Pointer use never takes focus from the search field.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(c)}
                >
                  <span className="palette-label">{c.label}</span>
                  {c.hint !== undefined && <span className="palette-hint">{c.hint}</span>}
                  {c.signed === true && c.allowed && <span className="palette-badge">passkey</span>}
                  {!c.allowed && <span className="palette-badge refused">{c.floor ? "floor" : "not available"}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && <p className="palette-empty">{loading ? "Loading" : `Nothing matches "${query}".`}</p>}
        <div className="palette-detail" aria-live="polite">
          {current !== undefined && !current.allowed && (
            <>
              <p>
                <strong>{current.label}</strong>: {current.reason ?? "Not available to you."}
              </p>
              {current.missing !== undefined && <p className="muted small">Missing: {current.missing.join(", ")}.</p>}
              {current.change !== undefined && <p className="muted small">{current.floor ? "Why nothing changes this: " : "What would change it: "}{current.change}</p>}
            </>
          )}
          {(current === undefined || current.allowed) && (
            <p className="muted small">
              <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const optionId = (list: string, id: string) => `${list}-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
