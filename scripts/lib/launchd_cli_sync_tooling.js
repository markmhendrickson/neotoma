import { execFileSync } from "child_process";
import { existsSync } from "fs";

function normalizePath(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isNodeScriptPath(value) {
  return /\.(?:cjs|mjs|js)$/i.test(value);
}

export function resolveLaunchdCliSyncTooling({
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
  env = process.env,
  pathExists = existsSync,
  execFile = execFileSync,
} = {}) {
  const tooling = {
    nodePath: normalizePath(execPath),
    npmCliPath: "",
    npmBinPath: "",
  };

  const normalizedNpmExecPath = normalizePath(npmExecPath);
  if (normalizedNpmExecPath && pathExists(normalizedNpmExecPath)) {
    if (isNodeScriptPath(normalizedNpmExecPath)) {
      tooling.npmCliPath = normalizedNpmExecPath;
    } else {
      tooling.npmBinPath = normalizedNpmExecPath;
    }
  }

  if (!tooling.npmBinPath) {
    try {
      const resolvedNpmBin = normalizePath(
        execFile("/bin/sh", ["-lc", "command -v npm"], {
          encoding: "utf8",
          env,
        }),
      );
      if (resolvedNpmBin && pathExists(resolvedNpmBin)) {
        tooling.npmBinPath = resolvedNpmBin;
      }
    } catch {
      // Leave npmBinPath empty; the launchd wrapper falls back to PATH.
    }
  }

  return tooling;
}

export function buildLaunchdCliSyncEnv(tooling) {
  const env = {};

  if (tooling.nodePath) {
    env.NEOTOMA_LAUNCHD_NODE = tooling.nodePath;
  }
  if (tooling.npmCliPath) {
    env.NEOTOMA_LAUNCHD_NPM_CLI = tooling.npmCliPath;
  }
  if (tooling.npmBinPath) {
    env.NEOTOMA_LAUNCHD_NPM_BIN = tooling.npmBinPath;
  }

  return env;
}
