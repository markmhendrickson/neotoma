import { appendFileSync } from "node:fs";
export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  const url = resolved.url.split("?")[0];
  if (
    /\/dist\/(server|actions)\.js$/.test(url) ||
    /\/dist\/repositories\/(db\/connection|sqlite\/sqlite_client)\.js$/.test(url) ||
    /\/node_modules\/(openai|@modelcontextprotocol\/sdk)\//.test(url)
  ) {
    appendFileSync(process.env.KERNEL_IMPORT_JOURNAL, "blocked\n");
    throw new Error("READ_KERNEL_FORBIDDEN_IMPORT");
  }
  return resolved;
}
