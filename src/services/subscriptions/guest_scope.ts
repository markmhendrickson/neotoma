/**
 * Whether a guest's entity grant permits access to an existing subscription.
 * `null` represents an authenticated owner or local-trust caller that does not
 * need guest-token narrowing.
 */
export function subscriptionWithinGuestScope(
  grantedEntityIds: string[] | null,
  subscriptionEntityIds: string[] | undefined
): boolean {
  if (grantedEntityIds === null) return true;
  if (!subscriptionEntityIds || subscriptionEntityIds.length === 0) return false;
  const granted = new Set(grantedEntityIds);
  return subscriptionEntityIds.every((id) => granted.has(id));
}
