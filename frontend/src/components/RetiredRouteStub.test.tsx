// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RetiredRouteStub } from "./RetiredRouteStub";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/pr-42/");
});

function renderStub(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<RetiredRouteStub />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("client-side retired route navigation", () => {
  it("keeps a published viewer page on the current origin and preview prefix", () => {
    window.history.replaceState({}, "", "/pr-42/readme/");

    renderStub("/readme?topic=quick-start#install");

    const link = screen.getByRole("link", { name: /continue/i });
    expect(new URL(link.getAttribute("href")!, window.location.origin).origin).toBe(
      window.location.origin
    );
    expect(link).toHaveAttribute("href", "/pr-42/readme/?topic=quick-start#install");
  });

  it("keeps an internal docs destination on the current origin and preview prefix", () => {
    window.history.replaceState({}, "", "/pr-42/docs");

    renderStub("/docs?from=reader#section");

    const link = screen.getByRole("link", { name: /continue/i });
    expect(new URL(link.getAttribute("href")!, window.location.origin).origin).toBe(
      window.location.origin
    );
    expect(link).toHaveAttribute("href", "/pr-42/?from=reader#section");
  });

  it("keeps the destination's references fragment when falling back home without a caller hash", () => {
    window.history.replaceState({}, "", "/pr-42/docs");

    renderStub("/docs?from=reader");

    expect(screen.getByRole("link", { name: /continue/i })).toHaveAttribute(
      "href",
      "/pr-42/?from=reader#references"
    );
  });

  it("leaves GitHub destinations unchanged and does not forward the caller query or fragment", () => {
    renderStub("/docker?private=caller#private-fragment");

    const githubUrl =
      "https://github.com/markmhendrickson/neotoma/blob/main/docs/developer/docker.md";
    expect(screen.getByRole("link", { name: /continue/i })).toHaveAttribute("href", githubUrl);
  });
});
