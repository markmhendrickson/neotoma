/**
 * Redirect-following gate — `guardedFetch()`.
 *
 * `isPublicFetchUrlAllowed` only ever checked the URL a caller supplied.
 * None of the five sinks in `ssrf_sink_wiring.test.ts` passed
 * `redirect: "manual"` to `fetch`, so a validated public host that responds
 * with a 3xx to a private/loopback/link-local/metadata target was followed
 * straight through by the platform default, with the guard never seeing the
 * real destination. These tests exercise `guardedFetch()` directly against
 * a stubbed `fetch` that issues redirects, proving each hop is re-checked —
 * not just the URL the caller originally supplied.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { guardedFetch } from "../../src/services/net/private_host_guard.js";

const HOSTED = "NEOTOMA_HOSTED_MODE";

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function okResponse(body = "ok"): Response {
  return new Response(body, { status: 200 });
}

describe("guardedFetch — redirect re-validation", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env[HOSTED] = "1";
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    delete process.env[HOSTED];
    vi.unstubAllGlobals();
  });

  it("refuses a redirect from a validated public host to a private target", async () => {
    fetchSpy.mockResolvedValueOnce(redirectResponse("http://169.254.169.254/latest/meta-data/"));

    await expect(guardedFetch("https://hooks.example.com/webhook")).rejects.toThrow(
      /refusing to fetch.*reached via redirect/i
    );

    // The first hop (the caller-supplied public URL) is legitimately
    // fetched — the guard's job is to catch the SECOND hop, not to refuse
    // ever calling a validated public host.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hooks.example.com/webhook",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("refuses a redirect to the WHATWG-normalized IPv4-mapped IPv6 form", () => {
    // Same bypass class as the direct-URL regression, reached one hop later.
    fetchSpy.mockResolvedValueOnce(
      redirectResponse("http://[::ffff:169.254.169.254]/latest/meta-data/")
    );
    return expect(guardedFetch("https://hooks.example.com/webhook")).rejects.toThrow(
      /refusing to fetch/i
    );
  });

  it("follows a redirect chain of validated public hosts and returns the final response", async () => {
    fetchSpy
      .mockResolvedValueOnce(redirectResponse("https://hop2.example.com/"))
      .mockResolvedValueOnce(redirectResponse("https://hop3.example.com/"))
      .mockResolvedValueOnce(okResponse("final"));

    const res = await guardedFetch("https://hop1.example.com/");
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("final");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("refuses a redirect target reached partway through an otherwise-public chain", async () => {
    fetchSpy
      .mockResolvedValueOnce(redirectResponse("https://hop2.example.com/"))
      .mockResolvedValueOnce(redirectResponse("http://127.0.0.1:9000/admin"));

    await expect(guardedFetch("https://hop1.example.com/")).rejects.toThrow(
      /refusing to fetch.*reached via redirect/i
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("resolves a relative Location against the URL that produced it", async () => {
    fetchSpy
      .mockResolvedValueOnce(redirectResponse("/relative-path"))
      .mockResolvedValueOnce(okResponse());

    await guardedFetch("https://hooks.example.com/webhook");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://hooks.example.com/relative-path",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("gives up after too many redirects rather than looping forever", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(redirectResponse("https://hop.example.com/"))
    );
    await expect(guardedFetch("https://hop.example.com/")).rejects.toThrow(
      /exceeded .* redirects/i
    );
  });

  it("returns a non-redirect response (e.g. an error status) without following anything", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const res = await guardedFetch("https://hooks.example.com/webhook");
    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("passes through a 3xx with no Location header rather than guessing", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const res = await guardedFetch("https://hooks.example.com/webhook");
    expect(res.status).toBe(304);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("guardedFetch — self-hosted mode (no restriction)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env[HOSTED];
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows a redirect to a loopback target when not in hosted mode", async () => {
    fetchSpy
      .mockResolvedValueOnce(redirectResponse("http://127.0.0.1:9000/hook"))
      .mockResolvedValueOnce(okResponse());

    const res = await guardedFetch("http://127.0.0.1:8080/webhook");
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
