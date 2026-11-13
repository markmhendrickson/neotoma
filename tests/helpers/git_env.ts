/**
 * Keep tests that run git acting on the repository they name, never on the
 * repository the test run happens to be started from.
 *
 * Why this exists
 * ---------------
 * Git exports repository-locating variables to every hook it runs. In a linked
 * worktree, a pre-commit hook sees `GIT_DIR=<main clone>/.git/worktrees/<name>`
 * and `GIT_INDEX_FILE=<that dir>/index`; in a main clone it sees a relative
 * `GIT_INDEX_FILE`. Any `git` child process inherits them, and an inherited
 * `GIT_DIR` OVERRIDES the child's `cwd`: `git init <tmp>` re-initialises the
 * enclosing repository instead of creating one in `<tmp>`, and
 * `git fetch --depth 1` run "inside" a temp clone writes grafts into the
 * enclosing repository's `shallow` file. Because the pre-commit hook runs the
 * test suite, both happened to a real shared clone: `core.bare` was flipped to
 * `true` and the full clone was made to look shallow.
 *
 * Three layers keep that from recurring:
 *   1. `.husky/pre-commit` unsets {@link GIT_REPOSITORY_ENV_VARS} for the test
 *      stages only (its own git commands still need them).
 *   2. `vitest.global_setup.ts` and `vitest.setup.ts` call
 *      {@link stripGitRepositoryEnv} on `process.env`, so a test run inherits
 *      none of them however vitest was started.
 *   3. Tests that spawn git do it through {@link gitSync} / {@link gitChildEnv},
 *      which remove EVERY `GIT_*` variable from the child's environment.
 *      `tests/contract/git_env_isolation.test.ts` fails if a test file spawns
 *      git any other way.
 *
 * Limit of the layer-3 scan: it reads test source for a direct call whose
 * program is `git` (and for simple-git imports). It does NOT see git started
 * through a shell string (`spawn("sh", ["-c", "git ..."])`, a bash step run
 * by a test) or by a sub-script a test runs (`node scripts/x.mjs` that calls
 * git itself). Those are covered only by layers 1 and 2, and only as long as
 * the test builds the child's `env` from `process.env` (or from
 * {@link gitChildEnv}) rather than from a copy taken before setup ran.
 */
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";

/**
 * Variables that tell git WHICH repository, index or object store to use. Any
 * one of them inherited by a child `git` makes it ignore its `cwd`.
 *
 * `.husky/pre-commit` unsets exactly this list before running tests; the
 * contract test asserts the two stay equal.
 */
export const GIT_REPOSITORY_ENV_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
] as const;

/**
 * Delete {@link GIT_REPOSITORY_ENV_VARS} from `env` in place. Returns the names
 * that were present, so a caller can report what it removed.
 */
export function stripGitRepositoryEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const removed: string[] = [];
  for (const name of GIT_REPOSITORY_ENV_VARS) {
    if (name in env) {
      removed.push(name);
      delete env[name];
    }
  }
  return removed;
}

/**
 * A copy of `base` with every `GIT_*` variable removed, then `extra` applied.
 *
 * Broader than {@link GIT_REPOSITORY_ENV_VARS} on purpose: a hook also exports
 * `GIT_CONFIG_PARAMETERS` (the committer's `-c` flags), `GIT_AUTHOR_*` and
 * `GIT_EDITOR`, none of which a test's own git should inherit. A test that
 * needs a specific git variable passes it in `extra`.
 */
export function gitChildEnv(
  base: NodeJS.ProcessEnv = process.env,
  extra: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(base)) {
    if (!name.startsWith("GIT_")) env[name] = value;
  }
  return { ...env, ...extra };
}

export type GitSyncOptions = ExecFileSyncOptions & {
  /**
   * Git variables the test sets on purpose (e.g. `GIT_AUTHOR_NAME`,
   * `GIT_CONFIG_NOSYSTEM`). Applied AFTER the scrub, so they survive it.
   */
  gitEnv?: NodeJS.ProcessEnv;
};

/**
 * `execFileSync("git", args, options)` with the child environment built by
 * {@link gitChildEnv}. An `env` in `options` is used as the base and is
 * scrubbed the same way; `gitEnv` is added afterwards. Returns stdout as a
 * string (`encoding` defaults to utf8); use `stdio` in `options` as usual.
 * Throws on a non-zero exit, like `execFileSync`.
 */
export function gitSync(args: readonly string[], options: GitSyncOptions = {}): string {
  const { env, encoding, gitEnv, ...rest } = options;
  const out = execFileSync("git", [...args], {
    ...rest,
    encoding: encoding ?? "utf8",
    env: gitChildEnv(env ?? process.env, gitEnv),
  });
  return typeof out === "string" ? out : (out?.toString() ?? "");
}
