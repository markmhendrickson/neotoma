/**
 * Shared form for creating + editing `agent_grant` entities.
 *
 * The form keeps the capability list small and explicit: each row is one
 * `{op, entity_types}` entry that mirrors the wire shape used by the
 * REST API and `enforceAgentCapability` on the server.
 */

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AgentCapabilityEntry,
  AgentCapabilityOp,
  AgentGrant,
  AgentGrantCreateRequest,
  AgentGrantUpdateRequest,
} from "@/types/api";

const CAPABILITY_OPS: ReadonlyArray<{ value: AgentCapabilityOp; label: string }> = [
  { value: "store_structured", label: "store_structured" },
  { value: "create_relationship", label: "create_relationship" },
  { value: "correct", label: "correct" },
  { value: "retrieve", label: "retrieve" },
];

interface AgentGrantFormState {
  label: string;
  match_sub: string;
  match_iss: string;
  match_thumbprint: string;
  notes: string;
  capabilities: AgentCapabilityEntry[];
}

interface AgentGrantFormProps {
  initial?: Partial<AgentGrant>;
  /** Initial identity-match fields prefilled from a promoted observed-agent. */
  identityHint?: {
    sub?: string | null;
    iss?: string | null;
    thumbprint?: string | null;
    label?: string | null;
  };
  submitLabel: string;
  /** When true, we render Cancel as a plain button (caller handles closing). */
  showCancel?: boolean;
  onCancel?: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  /**
   * Called with either the create payload (when no `initial.grant_id` is
   * present) or the update payload (otherwise). Form-level validation is
   * delegated to the server, so this just normalizes empty strings to
   * null and trims values.
   */
  onSubmit: (
    payload: AgentGrantCreateRequest | AgentGrantUpdateRequest,
  ) => void | Promise<void>;
}

function emptyCapability(): AgentCapabilityEntry {
  return { op: "store_structured", entity_types: ["*"] };
}

function buildInitialState(
  initial: Partial<AgentGrant> | undefined,
  identityHint: AgentGrantFormProps["identityHint"],
): AgentGrantFormState {
  return {
    label: initial?.label ?? identityHint?.label ?? "",
    match_sub: initial?.match_sub ?? identityHint?.sub ?? "",
    match_iss: initial?.match_iss ?? identityHint?.iss ?? "",
    match_thumbprint:
      initial?.match_thumbprint ?? identityHint?.thumbprint ?? "",
    notes: initial?.notes ?? "",
    capabilities:
      initial?.capabilities && initial.capabilities.length > 0
        ? initial.capabilities.map((c) => ({
            op: c.op,
            entity_types: c.entity_types.length > 0 ? [...c.entity_types] : ["*"],
          }))
        : [emptyCapability()],
  };
}

export function AgentGrantForm({
  initial,
  identityHint,
  submitLabel,
  showCancel,
  onCancel,
  isSubmitting,
  errorMessage,
  onSubmit,
}: AgentGrantFormProps) {
  const [state, setState] = useState<AgentGrantFormState>(() =>
    buildInitialState(initial, identityHint),
  );

  useEffect(() => {
    setState(buildInitialState(initial, identityHint));
  }, [initial?.grant_id, identityHint?.sub, identityHint?.thumbprint, identityHint?.iss, identityHint?.label]);

  function update<K extends keyof AgentGrantFormState>(
    key: K,
    value: AgentGrantFormState[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function updateCapability(index: number, next: AgentCapabilityEntry) {
    setState((prev) => ({
      ...prev,
      capabilities: prev.capabilities.map((c, i) => (i === index ? next : c)),
    }));
  }

  function removeCapability(index: number) {
    setState((prev) => ({
      ...prev,
      capabilities: prev.capabilities.filter((_, i) => i !== index),
    }));
  }

  function addCapability() {
    setState((prev) => ({
      ...prev,
      capabilities: [...prev.capabilities, emptyCapability()],
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trim = (value: string): string | null => {
      const t = value.trim();
      return t === "" ? null : t;
    };
    const capabilities = state.capabilities.map((c) => ({
      op: c.op,
      entity_types: (Array.isArray(c.entity_types) ? c.entity_types : [])
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    }));
    const payload: AgentGrantCreateRequest | AgentGrantUpdateRequest = {
      label: state.label.trim(),
      capabilities,
      match_sub: trim(state.match_sub),
      match_iss: trim(state.match_iss),
      match_thumbprint: trim(state.match_thumbprint),
      notes: trim(state.notes),
    };
    onSubmit(payload);
  }

  const matchHint =
    "At least one of match_sub or match_thumbprint must be set. " +
    "When match_iss is set, both sub and iss must match.";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-2">
        <Label htmlFor="grant-label">Label</Label>
        <Input
          id="grant-label"
          required
          value={state.label}
          onChange={(e) => update("label", e.target.value)}
          placeholder="e.g. Cursor on macbook-pro"
        />
      </div>

      <fieldset className="grid gap-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Identity match</legend>
        <p className="text-xs text-muted-foreground">{matchHint}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="grant-sub" className="text-xs">
              match_sub
            </Label>
            <Input
              id="grant-sub"
              value={state.match_sub}
              onChange={(e) => update("match_sub", e.target.value)}
              placeholder="aauth subject"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="grant-iss" className="text-xs">
              match_iss
            </Label>
            <Input
              id="grant-iss"
              value={state.match_iss}
              onChange={(e) => update("match_iss", e.target.value)}
              placeholder="aauth issuer (optional)"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="grant-thumb" className="text-xs">
            match_thumbprint
          </Label>
          <Input
            id="grant-thumb"
            value={state.match_thumbprint}
            onChange={(e) => update("match_thumbprint", e.target.value)}
            placeholder="RFC 7638 JWK thumbprint"
            className="font-mono"
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <legend className="px-1 text-sm font-medium">Capabilities</legend>
          <Button type="button" variant="ghost" size="sm" onClick={addCapability}>
            <Plus className="mr-1 h-4 w-4" />
            Add row
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Each row authorizes one op on a list of entity types. Use{" "}
          <code className="font-mono">*</code> to widen to any non-protected
          entity type.
        </p>
        <div className="space-y-2">
          {state.capabilities.map((cap, index) => (
            <div
              key={index}
              className="grid gap-2 rounded border p-2 sm:grid-cols-[180px_1fr_auto]"
            >
              <Select
                value={cap.op}
                onValueChange={(value) =>
                  updateCapability(index, { ...cap, op: value as AgentCapabilityOp })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPABILITY_OPS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={cap.entity_types.join(", ")}
                onChange={(e) =>
                  updateCapability(index, {
                    ...cap,
                    entity_types: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0),
                  })
                }
                placeholder="entity_type, entity_type, * (any)"
                className="font-mono"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCapability(index)}
                disabled={state.capabilities.length <= 1}
                aria-label="Remove capability"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="grant-notes">Notes</Label>
        <Textarea
          id="grant-notes"
          value={state.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Optional context for this grant (machine, owner, expiry…)"
          rows={3}
        />
      </div>

      {errorMessage && (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {showCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
