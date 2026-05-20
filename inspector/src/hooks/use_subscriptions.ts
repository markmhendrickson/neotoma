import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import {
  getSubscriptionStatus,
  listSubscriptions,
  unsubscribe,
  type SubscribeRequest,
  subscribe,
} from "@/api/endpoints/subscriptions";

export function useSubscriptionsList() {
  return useQuery({
    queryKey: ["subscriptions", "list"],
    queryFn: listSubscriptions,
    enabled: isApiUrlConfigured(),
  });
}

export function useSubscriptionStatus(subscriptionId: string | undefined) {
  return useQuery({
    queryKey: ["subscriptions", "status", subscriptionId],
    queryFn: () => getSubscriptionStatus(subscriptionId!),
    enabled: isApiUrlConfigured() && Boolean(subscriptionId?.trim()),
  });
}

export function useUnsubscribeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subscription_id: string) => unsubscribe(subscription_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useSubscribeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SubscribeRequest) => subscribe(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
