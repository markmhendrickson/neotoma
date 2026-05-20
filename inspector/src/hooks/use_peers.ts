import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { getPeer, listPeers, removePeer, syncPeer, type AddPeerRequest, addPeer } from "@/api/endpoints/peers";

export function usePeersList() {
  return useQuery({
    queryKey: ["peers", "list"],
    queryFn: listPeers,
    enabled: isApiUrlConfigured(),
  });
}

export function usePeerDetail(peerId: string | undefined) {
  return useQuery({
    queryKey: ["peers", "detail", peerId],
    queryFn: () => getPeer(peerId!),
    enabled: isApiUrlConfigured() && Boolean(peerId?.trim()),
  });
}

export function useRemovePeerMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (peerId: string) => removePeer(peerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peers"] });
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useSyncPeerMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (peerId: string) => syncPeer(peerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peers"] });
    },
  });
}

export function useAddPeerMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPeerRequest) => addPeer(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peers"] });
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
