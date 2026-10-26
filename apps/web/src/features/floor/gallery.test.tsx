import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeGallery } from "./ThemeGallery.js";
import { THEME_CATALOG } from "./themes/registry.js";
it("labels sample previews and prevents public activation of draft artwork", () => {
  render(
    <ThemeGallery
      activeId="plain"
      onActivate={() => {}}
      onClose={() => {}}
      allowDrafts={false}
    />,
  );
  expect(
    screen
      .getAllByRole("button", { name: /Use .*theme/i })
      .filter((b) => !(b as HTMLButtonElement).disabled),
  ).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: `Preview ${THEME_CATALOG[0]!.title}` }),
  );
  expect(screen.getByText("Preview — sample activity")).toBeDefined();
});
it("closes on Escape and can select plain without loading art", async () => {
  const close = vi.fn(),
    activate = vi.fn();
  render(
    <ThemeGallery
      activeId="plain"
      onActivate={activate}
      onClose={close}
      allowDrafts={false}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Use Plain Floor theme" }),
  );
  await waitFor(() => expect(activate).toHaveBeenCalledWith("plain"));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalled();
});
