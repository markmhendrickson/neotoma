/**
 * Env files the local development stack loads, in precedence order.
 *
 * `dotenv` does not override a key that is already set, so earlier files win and
 * the shell environment wins over all of them. The first file is the developer's
 * own; `.env.development` holds the non-secret settings that worktree setup
 * generates (see scripts/write-worktree-dev-env.js).
 */

import path from 'node:path';

export function devEnvFiles(projectRoot, nodeEnv) {
  return nodeEnv === 'production'
    ? [path.join(projectRoot, '.env.production'), path.join(projectRoot, '.env')]
    : [path.join(projectRoot, '.env'), path.join(projectRoot, '.env.development')];
}

/** Load the development env files into process.env using the given dotenv module. */
export function loadDevEnvFiles(dotenv, projectRoot, nodeEnv) {
  for (const file of devEnvFiles(projectRoot, nodeEnv)) {
    dotenv.config({ path: file });
  }
}
