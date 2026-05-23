import type { SnapshotFilter } from "@/types/api";

export interface SavedView {
  id: string;
  name: string;
  entity_type: string;
  filters: Record<string, SnapshotFilter>;
  sort_by: string;
  sort_order: "asc" | "desc";
  column_visibility: Record<string, boolean>;
  view_mode: "list" | "board";
  board_group_field?: string;
  created_at: string;
}

function storageKey(entityType: string): string {
  return `neotoma_saved_views_${entityType}`;
}

export function getSavedViews(entityType: string): SavedView[] {
  try {
    const raw = localStorage.getItem(storageKey(entityType));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveView(view: SavedView): void {
  try {
    const views = getSavedViews(view.entity_type);
    const idx = views.findIndex((v) => v.id === view.id);
    if (idx >= 0) {
      views[idx] = view;
    } else {
      views.push(view);
    }
    localStorage.setItem(storageKey(view.entity_type), JSON.stringify(views));
  } catch {
    // localStorage unavailable or quota exceeded — silently fail
  }
}

export function deleteView(entityType: string, viewId: string): void {
  try {
    const views = getSavedViews(entityType).filter((v) => v.id !== viewId);
    localStorage.setItem(storageKey(entityType), JSON.stringify(views));
  } catch {
    // localStorage unavailable — silently fail
  }
}

export function generateViewId(): string {
  return `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
