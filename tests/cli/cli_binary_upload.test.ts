import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiClient } from "../../src/shared/api_client.js";

const run = promisify(execFile);
describe("CLI remote binary transport", () => {
  let dir: string;
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  const requests: Array<{
    url: string;
    body: Buffer;
    headers: import("node:http").IncomingHttpHeaders;
  }> = [];
  const bytes = Buffer.alloc(12 * 1024 * 1024, 0xff);
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "neotoma-cli-upload-"));
    await writeFile(path.join(dir, "source.bin"), bytes);
    await writeFile(
      path.join(dir, "entities.json"),
      JSON.stringify([{ entity_type: "note", title: "Fixture" }])
    );
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      requests.push({ url: req.url!, body: Buffer.concat(chunks), headers: req.headers });
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          req.url?.startsWith("/sources/upload")
            ? { source_id: "fixture-source" }
            : {
                unstructured: { source_id: "fixture-source", asset_entity_id: "fixture-asset" },
                structured: {
                  entities_created: 1,
                  entities: [{ entity_id: "fixture-note", action: "created" }],
                },
              }
        )
      );
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    // A loopback address outside the CLI's co-located-server allowlist.
    baseUrl = `http://localhost.:${(server.address() as import("node:net").AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  });

  it.each(["store", "ingest", "upload"])(
    "%s transfers an above-inline-limit local file as multipart",
    async (command) => {
      requests.length = 0;
      const source = path.join(dir, "source.bin");
      const args =
        command === "store"
          ? ["store", "--file-path", source]
          : command === "upload"
            ? ["upload", source]
            : ["ingest", "--source-file", source, "--entities", path.join(dir, "entities.json")];
      await run(process.execPath, ["dist/cli/index.js", "--base-url", baseUrl, ...args], {
        env: {
          ...process.env,
          NEOTOMA_CLI_AAUTH_DISABLE: "1",
          NEOTOMA_BEARER_TOKEN: "fixture-token",
          NEOTOMA_FORCE_LOCAL_TRANSPORT: "false",
        },
      });
      const upload = requests.find((r) => r.url.startsWith("/sources/upload"));
      expect(upload).toBeDefined();
      expect(upload!.headers.authorization).toBe("Bearer fixture-token");
      expect(upload!.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
      const start = upload!.body.indexOf(Buffer.from("\r\n\r\n")) + 4;
      expect(upload!.body.subarray(start, start + bytes.length).equals(bytes)).toBe(true);
      const store = requests.find((r) => r.url === "/store");
      expect(JSON.parse(store!.body.toString()).source_id).toBe("fixture-source");
      expect(JSON.parse(store!.body.toString()).file_path).toBeUndefined();
    }
  );

  it("preserves binary multipart bytes through the default signing wrapper", async () => {
    requests.length = 0;
    const api = createApiClient({ baseUrl, token: "fixture-token", signWithCliAAuth: true });
    const binary = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x01]);
    const form = new FormData();
    form.append("file", new Blob([binary]), "bytes.bin");
    await api.POST("/sources/upload", {
      body: form as any,
      bodySerializer: (body) => body as unknown as FormData,
    });
    expect(requests[0].body.includes(binary)).toBe(true);
  });
});
