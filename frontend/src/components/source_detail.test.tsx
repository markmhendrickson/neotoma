// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SourceDetail } from "./SourceDetail";

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ settings: { bearerToken: "" } }),
}));

vi.mock("@/hooks/useKeys", () => ({
  useKeys: () => ({ bearerToken: "token", loading: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ sessionToken: null, user: { id: "user-1" } }),
}));

const subscribeMock = vi.fn(() => vi.fn());

vi.mock("@/contexts/RealtimeContext", () => ({
  useRealtime: () => ({ subscribe: subscribeMock }),
}));

function renderSourceDetail() {
  return render(
    <MemoryRouter initialEntries={["/sources/source-1#content"]}>
      <SourceDetail sourceId="source-1" />
    </MemoryRouter>,
  );
}

describe("SourceDetail raw content previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeMock.mockReturnValue(vi.fn());
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("renders a PDF preview from the source content endpoint when raw_text is absent", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/sources/source-1") {
        return {
          ok: true,
          json: async () => ({
            id: "source-1",
            content_hash: "hash-1",
            mime_type: "application/pdf",
            source_type: "file",
            original_filename: "example.pdf",
            created_at: "2024-01-01T00:00:00Z",
            user_id: "user-1",
          }),
        } as Response;
      }

      if (url === "/interpretations?source_id=source-1") {
        return {
          ok: true,
          json: async () => ({ interpretations: [] }),
        } as Response;
      }

      if (url === "/observations?source_id=source-1") {
        return {
          ok: true,
          json: async () => ({ observations: [] }),
        } as Response;
      }

      if (url === "/sources/source-1/content") {
        return {
          ok: true,
          headers: {
            get: (name: string) => (name === "Content-Type" ? "application/pdf" : null),
          },
          blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;

    renderSourceDetail();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/sources/source-1/content",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer token",
          }),
        }),
      );
    });

    expect(await screen.findByTestId("raw-source-pdf")).toHaveAttribute("src", "blob:preview");
    expect(screen.getByTestId("open-raw-source")).toHaveAttribute("download", "example.pdf");
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("uses inline raw_text without fetching the content endpoint", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/sources/source-1") {
        return {
          ok: true,
          json: async () => ({
            id: "source-1",
            content_hash: "hash-1",
            mime_type: "text/plain",
            source_type: "structured",
            original_filename: "example.txt",
            raw_text: "hello from raw text",
            created_at: "2024-01-01T00:00:00Z",
            user_id: "user-1",
          }),
        } as Response;
      }

      if (url === "/interpretations?source_id=source-1") {
        return {
          ok: true,
          json: async () => ({ interpretations: [] }),
        } as Response;
      }

      if (url === "/observations?source_id=source-1") {
        return {
          ok: true,
          json: async () => ({ observations: [] }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;

    renderSourceDetail();

    expect(await screen.findByText("hello from raw text")).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      "/sources/source-1/content",
      expect.anything(),
    );
  });
});
