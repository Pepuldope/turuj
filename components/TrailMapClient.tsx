"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { hasKeptMap } from "@/lib/keptMap";

// MapLibre touches `window`, so the map is client-only.
// Once loaded it is used directly: re-suspending on the next route page would hide the map for a frame or two.
let loaded: typeof import("@/components/TrailMap").TrailMap | null = null;
const TrailMapInner = dynamic(() => import("@/components/TrailMap").then((m) => (loaded = m.TrailMap)), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[var(--border)]" />,
});

/**
 * The map, loaded only once it scrolls near the screen: MapLibre is the
 * heaviest thing on the page and most phone visitors never reach it.
 */
export function TrailMap(props: ComponentProps<typeof TrailMapInner>) {
  const ref = useRef<HTMLDivElement>(null);
  // A parked map of the page just left is taken over at once: no placeholder frame in between.
  const [visible, setVisible] = useState(() => hasKeptMap(props.persistKey));

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const Inner = loaded ?? TrailMapInner;
  return (
    <div ref={ref} className="h-full w-full">
      {visible ? <Inner {...props} /> : <div className="h-full w-full bg-[var(--border)]" />}
    </div>
  );
}
