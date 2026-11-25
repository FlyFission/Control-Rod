import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client.js";

const UPDATE_COMMAND = "controlrod update";
const RESTART_COMMAND = "controlrod stop && controlrod start";
const updateNoticeKey = ["controlrod-update-notice"] as const;

function useUpdateNotice() {
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: updateNoticeKey,
    queryFn: api.updateNotice,
    staleTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const check = useMutation({
    mutationFn: api.checkUpdateNotice,
    retry: false,
    networkMode: "always",
    onSuccess: (result) => client.setQueryData(updateNoticeKey, result),
  });
  return { data, check, checkError: check.isError ? "Could not check for updates." : check.data?.error && data?.error };
}

export function UpdateNotice() {
  const { data, check, checkError } = useUpdateNotice();
  const [copyStatus, setCopyStatus] = useState("");
  const behind = data?.behind ?? 0;
  // Already downloaded and built, just not running yet: a restart brings it in.
  const restartOnly = behind > 0 && !!data?.checkout_commit && data.checkout_commit === data.latest_commit;
  const command = restartOnly ? RESTART_COMMAND : UPDATE_COMMAND;
  if (!behind && !checkError) return null;

  return (
    <section className="agent-updates" aria-label="Control Rod update">
      <div className="au-item">
        {behind > 0 && (
          restartOnly ? (
            <p>Control Rod was updated, but the running copy is still the older version ({behind} {behind === 1 ? "change" : "changes"} behind). Run <code>{command}</code> in a terminal to switch to it.</p>
          ) : (
            <p>A newer version of Control Rod is available ({behind} {behind === 1 ? "change" : "changes"}). Run <code>{command}</code> in a terminal.</p>
          )
        )}
        <div className="row">
          {behind > 0 && (
            <button type="button" className="btn small" onClick={async () => {
              try {
                await navigator.clipboard.writeText(command);
                setCopyStatus("Command copied.");
              } catch {
                setCopyStatus("Could not copy the command.");
              }
            }}>Copy</button>
          )}
          <button type="button" className="btn small" disabled={check.isPending} onClick={() => check.mutate()}>Check again</button>
          <span className="muted small" role="status">{checkError ?? (behind > 0 ? copyStatus : "")}</span>
        </div>
      </div>
    </section>
  );
}

export function ControlRodVersion() {
  const { data, check, checkError } = useUpdateNotice();
  if (!data) return null;
  return (
    <section className="row" aria-label="Control Rod version">
      <span className="muted small">Running version: <code>{data.running_commit.slice(0, 7)}</code></span>
      {!data.behind && <button type="button" className="btn small" disabled={check.isPending} onClick={() => check.mutate()}>Check again</button>}
      <span className="muted small" role="status">{checkError ?? data.error}</span>
    </section>
  );
}
