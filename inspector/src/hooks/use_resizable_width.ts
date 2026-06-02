import { useCallback, useEffect, useRef, useState } from "react";

export type UseResizableWidthOptions = {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  disabled?: boolean;
};

function clamp(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}

function readStoredWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
): number {
  if (typeof window === "undefined") return defaultWidth;
  const raw = window.localStorage.getItem(storageKey);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? clamp(parsed, minWidth, maxWidth) : defaultWidth;
}

export function useResizableWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  disabled = false,
}: UseResizableWidthOptions) {
  const [width, setWidth] = useState(() =>
    readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth),
  );
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (disabled) return;
    window.localStorage.setItem(storageKey, String(width));
  }, [disabled, storageKey, width]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = widthRef.current;
      setIsResizing(true);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const next = clamp(startWidth + (moveEvent.clientX - startX), minWidth, maxWidth);
        widthRef.current = next;
        setWidth(next);
      };

      const onPointerUp = () => {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [disabled, maxWidth, minWidth],
  );

  const setClampedWidth = useCallback(
    (next: number) => {
      const clamped = clamp(next, minWidth, maxWidth);
      widthRef.current = clamped;
      setWidth(clamped);
    },
    [maxWidth, minWidth],
  );

  return { width, isResizing, onResizePointerDown, setWidth: setClampedWidth };
}
