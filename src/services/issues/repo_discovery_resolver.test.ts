import { afterEach, describe, expect, it } from "vitest";

import {
  githubRawManifestUrl,
  resolveRepoDiscovery,
  SUPPORTED_MANIFEST_VERSION,
  type ManifestFetcher,
} from "./repo_discovery_resolver.js";

function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: SUPPORTED_MANIFEST_VERSION,
    repo: "acme/widgets",
    peer: {
      url: "https://neotoma.acme.example",
      public_key_thumbprint: "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs",
      peer_id: "acme-neotoma",
    },
    policy: {
      accepted_visibilities: ["public"],
      required_attestations: ["reporter_git_sha"],
    },
    ...overrides,
  };
}

/** Build a fetcher that returns the given JSON (or a raw string / null) for any repo. */
function fetcherReturning(value: unknown): ManifestFetcher {
  return async () =>
    value === null ? null : typeof value === "string" ? value : JSON.stringify(value);
}

const ORIGINAL_HOSTED_MODE = process.env.NEOTOMA_HOSTED_MODE;
afterEach(() => {
  if (ORIGINAL_HOSTED_MODE === undefined) delete process.env.NEOTOMA_HOSTED_MODE;
  else process.env.NEOTOMA_HOSTED_MODE = ORIGINAL_HOSTED_MODE;
});

describe("githubRawManifestUrl", () => {
  it("builds the canonical raw URL on the default branch", () => {
    expect(githubRawManifestUrl("acme", "widgets")).toBe(
      "https://raw.githubusercontent.com/acme/widgets/HEAD/.well-known/neotoma.json"
    );
  });
});

describe("resolveRepoDiscovery — happy path", () => {
  it("routes to the declared peer when the manifest is valid and self-consistent", async () => {
    const result = await resolveRepoDiscovery("acme/widgets", fetcherReturning(validManifest()));
    expect(result.route).not.toBeNull();
    if (result.route) {
      expect(result.effective_repo).toBe("acme/widgets");
      expect(result.route.peer.url).toBe("https://neotoma.acme.example");
      expect(result.route.peer.public_key_thumbprint).toBe(
        "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
      );
      expect(result.route.policy.accepted_visibilities).toEqual(["public"]);
    }
  });

  it("preserves optional fields (peer_id, rate_limit, requires_approval, contact)", async () => {
    const result = await resolveRepoDiscovery(
      "acme/widgets",
      fetcherReturning(
        validManifest({
          peer: {
            url: "https://neotoma.acme.example",
            public_key_thumbprint: "thumb",
            peer_id: "acme-neotoma",
          },
          policy: {
            accepted_visibilities: ["public", "private"],
            required_attestations: ["reporter_git_sha", "reporter_app_version"],
            rate_limit_per_hour: 20,
            requires_approval: true,
          },
          contact: "https://github.com/acme/widgets/issues",
        })
      )
    );
    expect(result.route).not.toBeNull();
    if (result.route) {
      expect(result.route.peer.peer_id).toBe("acme-neotoma");
      expect(result.route.policy.rate_limit_per_hour).toBe(20);
      expect(result.route.policy.requires_approval).toBe(true);
      expect(result.route.contact).toBe("https://github.com/acme/widgets/issues");
    }
  });
});

describe("resolveRepoDiscovery — no route / fallback reasons", () => {
  it("returns no_manifest when the repo has not published one (404)", async () => {
    const result = await resolveRepoDiscovery("acme/widgets", fetcherReturning(null));
    expect(result.route).toBeNull();
    if (!result.route) expect(result.reason).toBe("no_manifest");
  });

  it("returns fetch_error when the fetcher throws (network / non-404 HTTP)", async () => {
    const result = await resolveRepoDiscovery("acme/widgets", async () => {
      throw new Error("HTTP 500");
    });
    expect(result.route).toBeNull();
    if (!result.route) {
      expect(result.reason).toBe("fetch_error");
      expect(result.detail).toContain("HTTP 500");
    }
  });

  it("returns invalid_json for unparseable bytes", async () => {
    const result = await resolveRepoDiscovery("acme/widgets", fetcherReturning("{not json"));
    expect(result.route).toBeNull();
    if (!result.route) expect(result.reason).toBe("invalid_json");
  });

  it("returns unsupported_version for a future major version", async () => {
    const result = await resolveRepoDiscovery(
      "acme/widgets",
      fetcherReturning(validManifest({ version: 2 }))
    );
    expect(result.route).toBeNull();
    if (!result.route) expect(result.reason).toBe("unsupported_version");
  });

  it("rejects a malformed targetRepo before fetching", async () => {
    const result = await resolveRepoDiscovery("not-a-repo", fetcherReturning(validManifest()));
    expect(result.route).toBeNull();
    if (!result.route) expect(result.reason).toBe("schema_invalid");
  });
});

describe("resolveRepoDiscovery — schema validation", () => {
  it.each([
    ["missing peer.url", validManifest({ peer: { public_key_thumbprint: "t" } })],
    ["missing thumbprint", validManifest({ peer: { url: "https://x.example" } })],
    [
      "empty accepted_visibilities",
      validManifest({ policy: { accepted_visibilities: [], required_attestations: [] } }),
    ],
    [
      "bad visibility value",
      validManifest({ policy: { accepted_visibilities: ["secret"], required_attestations: [] } }),
    ],
    [
      "bad attestation value",
      validManifest({
        policy: { accepted_visibilities: ["public"], required_attestations: ["reporter_email"] },
      }),
    ],
    [
      "non-numeric rate_limit",
      validManifest({
        policy: {
          accepted_visibilities: ["public"],
          required_attestations: [],
          rate_limit_per_hour: "lots",
        },
      }),
    ],
  ])("rejects %s as schema_invalid", async (_label, manifest) => {
    const result = await resolveRepoDiscovery("acme/widgets", fetcherReturning(manifest));
    expect(result.route).toBeNull();
    if (!result.route) expect(result.reason).toBe("schema_invalid");
  });
});

describe("resolveRepoDiscovery — trust checks", () => {
  it("rejects a manifest whose repo field does not match the served repo (spoof guard)", async () => {
    // Served from acme/widgets but claims to route victim/repo.
    const result = await resolveRepoDiscovery(
      "acme/widgets",
      fetcherReturning(validManifest({ repo: "victim/repo" }))
    );
    expect(result.route).toBeNull();
    if (!result.route) expect(result.reason).toBe("repo_mismatch");
  });

  it("matches repo case-insensitively", async () => {
    const result = await resolveRepoDiscovery(
      "Acme/Widgets",
      fetcherReturning(validManifest({ repo: "acme/widgets" }))
    );
    expect(result.route).not.toBeNull();
  });

  it("rejects an unparseable peer.url", async () => {
    const result = await resolveRepoDiscovery(
      "acme/widgets",
      fetcherReturning(
        validManifest({ peer: { url: "::not a url::", public_key_thumbprint: "t" } })
      )
    );
    expect(result.route).toBeNull();
    if (!result.route) expect(result.reason).toBe("peer_url_invalid");
  });

  it("rejects a private/loopback peer host under hosted mode (SSRF)", async () => {
    process.env.NEOTOMA_HOSTED_MODE = "1";
    const result = await resolveRepoDiscovery(
      "acme/widgets",
      fetcherReturning(
        validManifest({
          peer: { url: "http://127.0.0.1:3080", public_key_thumbprint: "t" },
        })
      )
    );
    expect(result.route).toBeNull();
    if (!result.route) expect(result.reason).toBe("peer_url_private_host");
  });

  it("allows a loopback peer host when NOT in hosted mode (self-hosted single tenant)", async () => {
    delete process.env.NEOTOMA_HOSTED_MODE;
    const result = await resolveRepoDiscovery(
      "acme/widgets",
      fetcherReturning(
        validManifest({
          peer: { url: "http://localhost:3080", public_key_thumbprint: "t" },
        })
      )
    );
    expect(result.route).not.toBeNull();
  });
});
