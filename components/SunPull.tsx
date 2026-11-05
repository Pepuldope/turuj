"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { LAND } from "@/lib/season";
import type { Season } from "@/lib/season";

/** Pull this far (px, after resistance) and letting go reloads the page. */
const READY = 110;
const MAX = 200;
/** Where the page waits while the spinner turns. */
const HOLD = 96;
const RAYS = 12;
/** Space kept clear above the sun at rest (px), so wide headers never crop it. */
const EDGE = 4;

interface Props {
  season: Season;
  /** Scene size and sun position as passed to SeasonScene. */
  width: number;
  height: number;
  sunX: number;
  sunY: number;
  /** The block that moves down with the finger (the home column). */
  moveRef: RefObject<HTMLElement | null>;
}

const ease = (f: number) => 1 - Math.pow(1 - f, 3);

/**
 * The header's sun, which doubles as pull-to-refresh on phones: pulling the
 * page down from the top shows the sky above the header, the sun rises to
 * the middle and grows rays, and past the mark the rays turn as the spinner;
 * letting go there reloads the page. Draws over the scene in the same
 * coordinates (same viewBox and slice), so at rest it is the scene's sun.
 */
export function SunPull({ season, width, height, sunX, sunY, moveRef }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const sunRef = useRef<SVGGElement>(null);
  const raysRef = useRef<SVGGElement>(null);
  const land = LAND[season];
  const sunR = 11 * land.sunScale * 1.5;
  const x0 = width * sunX;
  const y0 = height * sunY;
  const summer = season === "leto";

  useEffect(() => {
    const svg = svgRef.current;
    const sun = sunRef.current;
    const rays = raysRef.current;
    const move = moveRef.current;
    if (!svg || !sun || !rays) return;
    const phone = window.matchMedia("(max-width: 639px)");
    const lines = Array.from(rays.children) as SVGLineElement[];
    let pull = 0;
    let state: "idle" | "pulling" | "refreshing" | "back" = "idle";
    let startY: number | null = null;
    let spin = 0;
    let raf = 0;

    const draw = () => {
      if (move) {
        move.style.transform = pull ? `translateY(${pull}px)` : "";
        move.style.willChange = pull ? "transform" : "";
      }
      const box = svg.getBoundingClientRect();
      // viewBox units per pixel under "slice", and where the header's top edge falls in them.
      const s = Math.max(box.width / width, box.height / height) || 1;
      const top = (height - box.height / s) / 2;
      // At rest the sun sits at sunY, but never so high that the crop of a wide header cuts it (Peter 2026-11-04).
      const rest = Math.max(y0, top + sunR + (summer ? 10 : 6) + EDGE / s);
      const e = ease(Math.min(1, pull / READY));
      const x = x0 + (width / 2 - x0) * e;
      const y = rest + (top - (pull * 0.52) / s - rest) * e;
      // The sky band would cover the rising sun while pulling.
      document.documentElement.toggleAttribute("data-pull", pull > 0);
      sun.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      const grow = Math.max(0, (Math.min(1, pull / READY) - 0.25) / 0.75);
      const turning = state === "refreshing";
      rays.setAttribute("transform", `rotate(${turning ? spin : 0})`);
      lines.forEach((l, i) => {
        const shown = turning || summer ? 1 : Math.max(0, Math.min(1, grow * RAYS - i));
        l.setAttribute("opacity", turning ? (0.25 + (0.75 * (RAYS - 1 - i)) / (RAYS - 1)).toFixed(2) : shown ? "0.8" : "0");
        const a = (i / RAYS) * 2 * Math.PI - Math.PI / 2;
        const r1 = sunR + 3 + 7 * shown;
        l.setAttribute("x2", (Math.cos(a) * r1).toFixed(1));
        l.setAttribute("y2", (Math.sin(a) * r1).toFixed(1));
      });
    };

    const tween = (to: number, ms: number, done?: () => void) => {
      cancelAnimationFrame(raf);
      const from = pull;
      const t0 = performance.now();
      raf = requestAnimationFrame(function step(now) {
        const k = Math.min(1, (now - t0) / ms);
        pull = from + (to - from) * ease(k);
        if (state === "refreshing") spin = (Math.floor((now - t0) / 85) * 30) % 360;
        draw();
        if (k < 1 || state === "refreshing") raf = requestAnimationFrame(step);
        else done?.();
      });
    };

    const release = () => {
      if (state !== "pulling") return;
      if (pull >= READY) {
        state = "refreshing";
        tween(HOLD, 220);
        // Long enough to see the spinner turn before the page reloads.
        window.setTimeout(() => window.location.reload(), 700);
      } else {
        state = "back";
        tween(0, 260, () => (state = "idle"));
      }
    };

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      startY = null;
      if (state !== "idle" || !phone.matches || e.touches.length !== 1 || window.scrollY > 0) return;
      // Dialogs and the map handle their own drags.
      if (target?.closest('[role="dialog"], .maplibregl-map')) return;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (state === "idle") {
        if (dy <= 0 || window.scrollY > 0) return void (startY = null);
        state = "pulling";
      }
      if (state !== "pulling") return;
      if (e.cancelable) e.preventDefault();
      pull = Math.min(MAX, Math.max(0, dy) * 0.55);
      draw();
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      release();
    };

    draw();
    window.addEventListener("resize", draw);
    // The browser's own pull-to-refresh would fight this one.
    const root = document.documentElement;
    const before = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      cancelAnimationFrame(raf);
      root.style.overscrollBehaviorY = before;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("resize", draw);
      document.documentElement.removeAttribute("data-pull");
      if (move) move.style.transform = "";
    };
  }, [moveRef, width, height, x0, y0, sunR, summer]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      // z-[2]: above the iPhone app's sky band (.sky-edge, z 1), so the band never covers the sun; under the sticky bars (z 10+).
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
    >
      <g ref={sunRef} transform={`translate(${x0} ${y0})`}>
        <circle r={sunR + 6} fill="#ffd36b" opacity={0.35} />
        <g ref={raysRef}>
          {Array.from({ length: RAYS }, (_, i) => {
            const a = (i / RAYS) * 2 * Math.PI - Math.PI / 2;
            const r = summer ? sunR + 10 : sunR + 3;
            return (
              <line
                key={i}
                x1={(Math.cos(a) * (sunR + 3)).toFixed(1)}
                y1={(Math.sin(a) * (sunR + 3)).toFixed(1)}
                x2={(Math.cos(a) * r).toFixed(1)}
                y2={(Math.sin(a) * r).toFixed(1)}
                stroke="#ffb000"
                strokeWidth={2.2}
                strokeLinecap="round"
                opacity={summer ? 0.75 : 0}
              />
            );
          })}
        </g>
        <circle r={sunR} fill={land.sun} />
      </g>
    </svg>
  );
}

/** The sky that carries on above the header, seen while the page is pulled down. */
export function PullSky({ season }: { season: Season }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-full h-[420px] sm:hidden"
      style={{ background: `linear-gradient(to bottom, #3f7fd0, #78aee6 45%, #a9cdf0 80%, ${LAND[season].sky1})` }}
    />
  );
}
