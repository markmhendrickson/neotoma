import { useMemo } from "react";
import { useSession } from "./use_infra";
import type { SessionResponse } from "@/api/endpoints/session";

/**
 * Normalised view of the current request's identity, derived from
 * `GET /session`. Used by the Feedback page's "Mine only" toggle and by
 * the Phase 4 admin-proxy feature flag that gates the pipeline-write UI
 * to hardware/software AAuth tiers.
 *
 * `submitterCandidate` is a best-effort match for the `submitter_id`
 * recorded on `neotoma_feedback` rows. The pipeline receives whatever
 * string the submitting agent passes in `submit_feedback.submitter_id`
 * (see `services/agent-site/netlify/functions/submit.ts`), so exact
 * matches are not guaranteed. We default to `attribution.agent_sub`
 * (the stable subject claim from AAuth) and fall back to `user_id`.
 */
export interface SessionIdentity {
  userId?: string;
  submitterCandidate?: string;
  clientName?: string;
  clientVersion?: string;
  agentSub?: string;
  tier?: string;
  eligibleForTrustedWrites: boolean;
  /** Raw payload from GET /session, exposed for debug/inspection. */
  raw?: SessionResponse;
}

export function useSessionIdentity() {
  const query = useSession();
  const identity = useMemo<SessionIdentity | undefined>(() => {
    const data = query.data;
    if (!data) return undefined;
    const attribution = data.attribution ?? {};
    const decision = attribution.decision ?? null;
    const agentSub = attribution.agent_sub ?? decision?.agent_sub ?? undefined;
    const submitterCandidate = agentSub ?? data.user_id ?? undefined;
    return {
      userId: data.user_id,
      submitterCandidate:
        typeof submitterCandidate === "string" && submitterCandidate.length > 0
          ? submitterCandidate
          : undefined,
      clientName: attribution.client_name ?? decision?.client_name,
      clientVersion: attribution.client_version ?? decision?.client_version,
      agentSub,
      tier: attribution.tier,
      eligibleForTrustedWrites: data.eligible_for_trusted_writes === true,
      raw: data,
    };
  }, [query.data]);

  return {
    ...query,
    identity,
  };
}
