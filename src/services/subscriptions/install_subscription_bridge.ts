import { substrateEventBus } from "../../events/substrate_event_bus.js";
import { handleSubstrateEventForSubscriptions } from "./subscription_bridge.js";
import { rebuildSubscriptionIndex } from "./subscription_index.js";

let installed = false;

export function installSubscriptionBridge(): void {
  if (installed) return;
  installed = true;
  void rebuildSubscriptionIndex();
  substrateEventBus.onSubstrateEvent((ev) => {
    void handleSubstrateEventForSubscriptions(ev);
  });
}
