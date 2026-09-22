import { describe, expect, it } from "vitest";

import { isLoopbackHost, resolveProxyBindHost } from "../../scripts/lib/proxy_bind_host.js";

describe("resolveProxyBindHost", () => {
  it("defaults to loopback when PROXY_HOST is unset", () => {
    expect(resolveProxyBindHost({})).toBe("127.0.0.1");
  });

  it("defaults to loopback when PROXY_HOST is empty or whitespace", () => {
    expect(resolveProxyBindHost({ PROXY_HOST: "" })).toBe("127.0.0.1");
    expect(resolveProxyBindHost({ PROXY_HOST: "   " })).toBe("127.0.0.1");
  });

  it("honors an explicit non-loopback PROXY_HOST as a deliberate opt-in", () => {
    expect(resolveProxyBindHost({ PROXY_HOST: "0.0.0.0" })).toBe("0.0.0.0");
  });

  it("honors an explicit loopback PROXY_HOST verbatim", () => {
    expect(resolveProxyBindHost({ PROXY_HOST: "127.0.0.1" })).toBe("127.0.0.1");
  });

  it("trims surrounding whitespace from an explicit value", () => {
    expect(resolveProxyBindHost({ PROXY_HOST: "  0.0.0.0  " })).toBe("0.0.0.0");
  });
});

describe("isLoopbackHost", () => {
  it("recognizes loopback spellings", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
    expect(isLoopbackHost("  127.0.0.1  ")).toBe(true);
  });

  it("rejects all-interfaces and other non-loopback hosts", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
    expect(isLoopbackHost("192.168.1.5")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
  });
});
