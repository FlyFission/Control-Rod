import { vendorFamily } from "../lib/vendor.js";

/** The vendor family of a provider the UI names as author or checker. */
export function VendorBadge({ provider }: { provider: string }) {
  const family = vendorFamily(provider);
  if (!family) return null;
  return (
    <span className="tag">
      <span className="sr-only">Vendor family </span>
      {family}
    </span>
  );
}
