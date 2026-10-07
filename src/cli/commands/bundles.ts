/**
 * `neotoma bundles <list|info|install|enable|disable>` (Bundles m3 activation).
 *
 * Surfaces the bundle registry and toggles persisted enable/disable state via
 * the activation orchestration in `src/services/bundles/activation.ts`, which
 * the MCP `manage_bundles` tool also calls.
 *
 * The two surfaces differ in WHEN a change takes effect. This CLI writes the
 * local bundle state file only (no running server required). A running server
 * reads that file once at startup and registers enabled bundles' schemas then,
 * so a CLI change reaches it only at its next restart, and never reaches a
 * server on another machine. `manage_bundles` runs inside the server, so its
 * changes apply immediately and it registers the bundle's schemas on the spot.
 * See {@link takesEffectNote}.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy, m3).
 */

import type { Command } from "commander";

function isJson(program: Command): boolean {
  return Boolean((program.opts() as { json?: boolean }).json);
}

function emit(program: Command, payload: unknown, lines: () => string): void {
  if (isJson(program)) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${lines()}\n`);
  }
}

function fail(program: Command, message: string): void {
  if (isJson(program)) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
  process.exitCode = 1;
}

/**
 * When a CLI state change takes effect. Shown after install/enable/disable so
 * the success message does not imply a running server already sees the change.
 */
export function takesEffectNote(
  action: "install" | "enable" | "disable",
  statePath: string
): string {
  const schemas = action === "disable" ? "" : ", when it also registers the bundle's schemas";
  return (
    `Recorded in ${statePath}. A running Neotoma server reads this file only at startup, ` +
    `so this change takes effect at its next restart${schemas}. A server on another ` +
    `machine never sees it. For immediate effect on a running server, use the ` +
    `manage_bundles MCP tool (action "${action}") instead.`
  );
}

export function registerBundlesCommand(program: Command): void {
  const bundlesCommand = program
    .command("bundles")
    .description(
      "Inspect and manage Neotoma bundles (the deliverable unit shipping schemas, " +
        "record-type docs, and skills). list | info | install | enable | disable."
    );

  bundlesCommand
    .command("list")
    .description("List all bundles in the registry with type, version, and enabled state.")
    .action(async () => {
      const { listBundles } = await import("../../services/bundles/index.js");
      const rows = listBundles();
      emit(program, { bundles: rows }, () => {
        if (rows.length === 0) return "No bundles found.";
        const header = "BUNDLE                TYPE     VERSION  STATE      ALWAYS  TYPES";
        const body = rows
          .map((r) => {
            const name = r.name.padEnd(21);
            const type = (r.bundle_type ?? "-").padEnd(8);
            const version = (r.version ?? "-").padEnd(8);
            const state = (r.enabled ? "enabled" : "disabled").padEnd(10);
            const always = (r.always_active ? "yes" : "no").padEnd(7);
            const types = String(r.provides_entity_types_count ?? 0);
            return `${name} ${type} ${version} ${state} ${always} ${types}`;
          })
          .join("\n");
        return `${header}\n${body}`;
      });
    });

  bundlesCommand
    .command("info <bundle>")
    .description("Show full manifest detail for one bundle.")
    .action(async (bundle: string) => {
      const { getBundleInfo } = await import("../../services/bundles/index.js");
      const info = getBundleInfo(bundle);
      if (!info) {
        fail(program, `Unknown bundle "${bundle}". Run "neotoma bundles list".`);
        return;
      }
      emit(program, info, () => {
        const m = info.manifest;
        const lines = [
          `Bundle:               ${m.name}`,
          `Type:                 ${m.bundle_type}`,
          `Version:              ${m.version}`,
          `Description:          ${m.description}`,
          `State:                ${info.enabled ? "enabled" : "disabled"}${
            info.always_active ? " (always active)" : ""
          }`,
          `requires_bundles:     ${m.requires_bundles.join(", ") || "(none)"}`,
          `provides_entity_types:${m.provides_entity_types.length ? " " + m.provides_entity_types.join(", ") : " (none)"}`,
          `provides_skills:      ${m.provides_skills.map((s) => s.name).join(", ") || "(none)"}`,
          `serves_use_cases:     ${m.serves_use_cases.join(", ") || "(none)"}`,
          `compatible_modes:     ${m.compatible_modes.join(", ")}`,
        ];
        return lines.join("\n");
      });
    });

  bundlesCommand
    .command("install <bundle>")
    .description("Mark a bundle enabled (validates + records state).")
    .action(async (bundle: string) => {
      const { installBundle, bundleStatePath, UnknownBundleError } =
        await import("../../services/bundles/index.js");
      try {
        const result = installBundle(bundle);
        const takesEffect = takesEffectNote("install", bundleStatePath());
        emit(
          program,
          { ok: true, ...result, takes_effect: takesEffect },
          () => `${result.message}\n${takesEffect}`
        );
      } catch (err) {
        if (err instanceof UnknownBundleError) {
          fail(program, err.message);
          return;
        }
        fail(program, err instanceof Error ? err.message : String(err));
      }
    });

  bundlesCommand
    .command("enable <bundle>")
    .description("Enable a previously-disabled bundle.")
    .action(async (bundle: string) => {
      const { enableBundle, bundleStatePath, UnknownBundleError } =
        await import("../../services/bundles/index.js");
      try {
        const result = enableBundle(bundle);
        const takesEffect = takesEffectNote("enable", bundleStatePath());
        emit(
          program,
          { ok: true, ...result, takes_effect: takesEffect },
          () => `${result.message}\n${takesEffect}`
        );
      } catch (err) {
        if (err instanceof UnknownBundleError) {
          fail(program, err.message);
          return;
        }
        fail(program, err instanceof Error ? err.message : String(err));
      }
    });

  bundlesCommand
    .command("disable <bundle>")
    .description("Disable a bundle. Refuses to disable an always-active default bundle.")
    .action(async (bundle: string) => {
      const { disableBundle, bundleStatePath, BundleStateError, UnknownBundleError } =
        await import("../../services/bundles/index.js");
      try {
        const result = disableBundle(bundle);
        const takesEffect = takesEffectNote("disable", bundleStatePath());
        emit(
          program,
          { ok: true, ...result, takes_effect: takesEffect },
          () => `${result.message}\n${takesEffect}`
        );
      } catch (err) {
        if (err instanceof UnknownBundleError || err instanceof BundleStateError) {
          fail(program, err.message);
          return;
        }
        fail(program, err instanceof Error ? err.message : String(err));
      }
    });
}
