import { describe, expect, it } from "vitest";

import config from "../../vite.config.ts";

describe("vite config", () => {
  it("treats frontend source files as TSX before import analysis", () => {
    expect(config.esbuild).toMatchObject({
      loader: "tsx",
      include: /frontend\/src\/.*\.[jt]sx?$/,
      exclude: [],
    });
  });

  it("treats .js files as JSX during dependency scanning", () => {
    expect(config.optimizeDeps?.esbuildOptions?.loader).toMatchObject({
      ".js": "jsx",
    });
  });
});
