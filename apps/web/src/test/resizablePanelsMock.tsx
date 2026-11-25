/**
 * A stand-in for react-resizable-panels under jsdom. jsdom has no layout: every element measures 0 by
 * 0 at the origin, so the real library takes every click as a grab of the separator and steals focus.
 * This keeps the same component names and the panel handle the shell uses (collapse, expand, resize,
 * isCollapsed, getSize), with sizes in pixels, so shell tests can drive the rail. Real dragging and
 * keyboard resizing are checked in a browser (see the change record's verification).
 */
import { createContext, type HTMLAttributes, type ReactNode, type Ref, type RefObject, useContext, useEffect, useRef, useState } from "react";

type PanelSize = { asPercentage: number; inPixels: number };
type Handle = {
  collapse(): void;
  expand(): void;
  getSize(): PanelSize;
  isCollapsed(): boolean;
  resize(size: number | string): void;
};

const GroupCtx = createContext<{ changed: () => void }>({ changed: () => undefined });

const px = (v: number | string | undefined, fallback: number) => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.endsWith("px")) return Number(v.slice(0, -2));
  return fallback;
};

export function Group({
  children,
  className,
  elementRef,
  onLayoutChanged,
}: {
  children?: ReactNode;
  className?: string;
  elementRef?: Ref<HTMLDivElement>;
  orientation?: string;
  onLayoutChanged?: (layout: Record<string, number>, meta: { isUserInteraction: boolean }) => void;
}) {
  const cb = useRef(onLayoutChanged);
  cb.current = onLayoutChanged;
  return (
    <GroupCtx.Provider value={{ changed: () => cb.current?.({}, { isUserInteraction: false }) }}>
      <div ref={elementRef} className={className} data-group="">
        {children}
      </div>
    </GroupCtx.Provider>
  );
}

export function Panel({
  children,
  className,
  id,
  panelRef,
  defaultSize,
  minSize,
  maxSize,
  collapsedSize,
  onResize,
}: {
  children?: ReactNode;
  className?: string;
  id?: string;
  panelRef?: RefObject<Handle | null>;
  defaultSize?: number | string;
  minSize?: number | string;
  maxSize?: number | string;
  collapsedSize?: number | string;
  collapsible?: boolean;
  groupResizeBehavior?: string;
  onResize?: (size: PanelSize) => void;
}) {
  const group = useContext(GroupCtx);
  const min = px(minSize, 0);
  const max = px(maxSize, Number.POSITIVE_INFINITY);
  const collapsedPx = px(collapsedSize, 0);
  const [size, setSize] = useState(() => px(defaultSize, 300));
  const last = useRef(size > collapsedPx ? size : min);
  const sizeRef = useRef(size);
  const set = (next: number) => {
    sizeRef.current = next;
    if (next > collapsedPx) last.current = next;
    setSize(next);
    onResize?.({ asPercentage: 0, inPixels: next });
    group.changed();
  };
  if (panelRef) {
    panelRef.current = {
      collapse: () => set(collapsedPx),
      expand: () => set(last.current),
      getSize: () => ({ asPercentage: 0, inPixels: sizeRef.current }),
      isCollapsed: () => sizeRef.current <= collapsedPx,
      resize: (v) => set(Math.min(max, Math.max(min, px(v, min)))),
    };
  }
  useEffect(() => {
    onResize?.({ asPercentage: 0, inPixels: sizeRef.current });
    // Mount only, as the library reports the first size once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div data-panel="" id={id} data-size-px={size}>
      <div className={className}>{children}</div>
    </div>
  );
}

export function Separator({
  disableDoubleClick: _d,
  elementRef,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "role"> & { disableDoubleClick?: boolean; elementRef?: Ref<HTMLDivElement> }) {
  return <div ref={elementRef} role="separator" aria-orientation="vertical" tabIndex={0} {...rest} />;
}

export function usePanelRef(): RefObject<Handle | null> {
  return useRef<Handle | null>(null);
}
