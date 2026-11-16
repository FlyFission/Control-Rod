import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { SubscriptionView } from "../api/types.js";
import { shortDigest, time } from "../lib/format.js";

/**
 * Settings > Subscriptions. Read-only. Every probe is one the daemon reported
 * for a registered provider CLI. There is no field for a token or an API key.
 */
export function Subscriptions() {
  const q = useQuery({ queryKey: ["subscriptions"], queryFn: api.subscriptions });
  return (
    <div className="place">
      <header className="place-head">
        <p className="muted small">Settings</p>
        <h1>Subscriptions</h1>
        <p className="muted">
          Provider CLIs use the sign-in you already have. Control Rod does not take an API key or a token, and it does not sign in for you.
        </p>
      </header>
      <section className="panel" aria-labelledby="provider-clis-title">
        <div className="panel-head">
          <h2 id="provider-clis-title">Provider CLIs</h2>
          {q.data?.reported_at !== undefined && <span className="muted small">Reported by the daemon {time(q.data.reported_at)}</span>}
        </div>
        {q.isLoading && <p className="muted">Loading</p>}
        {q.isError && (
          <div role="alert" className="error">
            <p>The subscription probes could not be loaded.</p>
            <button type="button" className="btn small" onClick={() => void q.refetch()}>
              Try again
            </button>
          </div>
        )}
        {q.isSuccess && !q.data.reported && (
          <p className="muted">No daemon has reported yet. Start Control Rod with pnpm cr start and the daemon probes each registered provider CLI.</p>
        )}
        {q.data?.reported && q.data.probes.length === 0 && <p className="muted">The daemon reported no provider CLI.</p>}
        {q.data?.platform && <p className="small">This machine was reported as {platformName(q.data.platform)}.</p>}
        {q.data !== undefined && q.data.probes.length > 0 && <ProbeTable probes={q.data.probes} pins={q.data.pins} />}
      </section>
      <section className="panel" aria-labelledby="checkers-title">
        <h2 id="checkers-title">Checkers</h2>
        {q.isLoading && <p className="muted">Loading</p>}
        {q.data && (
          <>
            <Tiers tiers={q.data.tiers} localRule={q.data.local_rule} />
            {q.data.checkers.length === 0 && <p className="muted">The checker list is the daemon&apos;s model registry. It has not been reported.</p>}
            {q.data.checkers.length > 0 && <CheckerTable checkers={q.data.checkers} />}
          </>
        )}
      </section>
    </div>
  );
}

function platformName(platform: string): string {
  if (platform === "wsl2") return "WSL2";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "native Linux";
  return platform;
}

function Tiers({ tiers, localRule }: { tiers: SubscriptionView["tiers"] | undefined; localRule: string | undefined }) {
  if (tiers === undefined) return <p className="muted">Loading checker tiers.</p>;
  return (
    <>
      <ul>
        {tiers.map((tier) => (
          <li key={tier.grade}>
            {tier.rule} ({tier.required} required)
          </li>
        ))}
      </ul>
      {localRule && <p>{localRule}</p>}
    </>
  );
}

function ProbeTable({ probes, pins }: { probes: SubscriptionView["probes"]; pins: SubscriptionView["pins"] }) {
  return (
    <div className="table-wrap">
      <table className="records" aria-labelledby="provider-clis-title">
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Installed</th>
            <th scope="col">Path</th>
            <th scope="col">Observed version</th>
            <th scope="col">Pinned</th>
            <th scope="col">Auth</th>
            <th scope="col">Qualification</th>
          </tr>
        </thead>
        <tbody>
          {probes.map((probe) => (
            <tr key={probe.id}>
              <th scope="row">
                {probe.display_name}
                {probe.vendor_family && (
                  <span className="tag">
                    <span className="sr-only">Vendor family </span>
                    {probe.vendor_family}
                  </span>
                )}
              </th>
              <td>{probe.installed ? "Installed" : "Not installed"}</td>
              <td className="mono small wrap">{probe.path ?? "not reported"}</td>
              <td className="mono small">{probe.observed_version ?? "not reported"}</td>
              <td className="small">{pinned(probe.id, pins)}</td>
              <td>
                {probe.auth === "signed-in" ? "Signed in" : probe.auth === "signed-out" ? "Not signed in" : "Unknown"}
                {probe.auth_note && <p className="muted small">{probe.auth_note}</p>}
              </td>
              <td>
                {probe.roles.length === 0 ? (
                  <p className="muted small">Qualification was not reported.</p>
                ) : (
                  <ul className="plain-list">
                    {probe.roles.map((role) => (
                      <li key={role.role}>
                        {role.role === "author" ? "Author" : "Checker"}: {role.qualified ? "Qualified" : "Not qualified"}. {role.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pinned(runtime: string, pins: SubscriptionView["pins"]): string {
  const rows = pins.filter((pin) => pin.runtime === runtime);
  if (rows.length === 0) return "Not pinned";
  return rows
    .map((pin) => `${pin.role === "author" ? "Author" : "Checker"} ${pin.version ? `${pin.version} ` : ""}${shortDigest(pin.digest)}`)
    .join("; ");
}

function CheckerTable({ checkers }: { checkers: SubscriptionView["checkers"] }) {
  return (
    <div className="table-wrap">
      <table className="records">
        <caption className="sr-only">Models in the daemon registry</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Vendor family</th>
            <th scope="col">Harness</th>
            <th scope="col">Safety and Material</th>
          </tr>
        </thead>
        <tbody>
          {checkers.map((checker) => (
            <tr key={checker.id}>
              <td className="mono">{checker.id}</td>
              <td>{checker.vendor_family ?? "not reported"}</td>
              <td className="mono">{checker.harness}</td>
              <td>{deciding(checker)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function deciding(checker: SubscriptionView["checkers"][number]): string {
  if (checker.local) return "No. A local model cannot be the deciding checker on Safety or Material.";
  if (!checker.deciding) return "No. This model is not a deciding checker on Safety or Material.";
  return "Yes. It can be a deciding checker.";
}
