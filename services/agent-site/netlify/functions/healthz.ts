import type { Config } from "@netlify/functions";
import { jsonResponse } from "../lib/responses.js";

export default async (): Promise<Response> => {
  return jsonResponse(200, { ok: true, service: "agent.neotoma.io", timestamp: new Date().toISOString() });
};

export const config: Config = { path: "/.netlify/functions/healthz" };
