import { getDb } from "@/lib/d1";

// Quick reviews after a trip (Peter, 2026-10-22: stored in our database). One row per
// trip and browser: the browser sends a random id it keeps, so a second review
// replaces the first. Nothing about the person: no name, no address, no IP.

import { FITS, NOTE_MAX, TIMINGS } from "@/lib/reviewLimits";
import type { Fit, Timing } from "@/lib/reviewLimits";

export interface ReviewIn {
  slug: string;
  reviewer: string;
  stars: number;
  fit: Fit | null;
  crowded: boolean | null;
  /** How the plan's times held up; older reviews have none. */
  timing: Timing | null;
  /** No longer asked (Peter 2026-10-23: choices only); still accepted from older pages. */
  note: string;
}

export interface ReviewSummary {
  n: number;
  /** Average stars, one decimal. */
  stars: number;
  /** How many said it was as described, harder, easier. */
  fit: Record<Fit, number>;
  crowded: number;
}

const SLUG = /^[a-z0-9-]{1,120}$/;
const REVIEWER = /^[a-z0-9-]{8,64}$/;

/** The review as stored, or null when anything in it is off. */
export function parseReview(body: unknown): ReviewIn | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const { slug, reviewer, stars, fit, crowded, timing, note } = b;
  if (typeof slug !== "string" || !SLUG.test(slug)) return null;
  if (typeof reviewer !== "string" || !REVIEWER.test(reviewer)) return null;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) return null;
  if (fit !== null && fit !== undefined && !FITS.includes(fit as Fit)) return null;
  if (crowded !== null && crowded !== undefined && typeof crowded !== "boolean") return null;
  if (timing !== null && timing !== undefined && !TIMINGS.includes(timing as Timing)) return null;
  if (note !== undefined && typeof note !== "string") return null;
  return {
    slug,
    reviewer,
    stars,
    fit: (fit as Fit | undefined) ?? null,
    crowded: (crowded as boolean | undefined) ?? null,
    timing: (timing as Timing | undefined) ?? null,
    note: (note ?? "").trim().slice(0, NOTE_MAX),
  };
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS review (slug TEXT NOT NULL, reviewer TEXT NOT NULL, stars INTEGER NOT NULL, fit TEXT, crowded INTEGER, note TEXT NOT NULL, at TEXT NOT NULL, timing TEXT, PRIMARY KEY (slug, reviewer)) WITHOUT ROWID`;
// Tables made before the timing question get the column once; "duplicate column" afterwards is fine.
const ADD_TIMING = `ALTER TABLE review ADD COLUMN timing TEXT`;
let ready: Promise<unknown> | null = null;

async function db() {
  const d = await getDb();
  if (!d) return null;
  ready ??= d
    .prepare(SCHEMA)
    .run()
    .then(() => d.prepare(ADD_TIMING).run().catch(() => undefined))
    .catch((err) => {
      ready = null;
      throw err;
    });
  await ready;
  return d;
}

/**
 * Stores one review, or changes the one this browser sent before; false without the database. A question left
 * unanswered the second time keeps its first answer: changing the stars later (Peter, 26 Nov 2026) or rating an
 * old visit, where only the stars are asked, must not wipe what was said about the trail.
 */
export async function saveReview(r: ReviewIn, at: Date): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  await d
    .prepare(
      `INSERT INTO review (slug, reviewer, stars, fit, crowded, note, at, timing) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (slug, reviewer) DO UPDATE SET stars = ?3, fit = COALESCE(?4, fit), crowded = COALESCE(?5, crowded), note = ?6, at = ?7, timing = COALESCE(?8, timing)`
    )
    .bind(r.slug, r.reviewer, r.stars, r.fit, r.crowded === null ? null : Number(r.crowded), r.note, at.toISOString(), r.timing)
    .run();
  return true;
}

/** The most trips one browser's reviews are given for. */
const OWN_MAX = 500;

/** A browser's own review of a trip, as it gets it back. */
export interface OwnReview {
  stars: number;
  fit: Fit | null;
  crowded: boolean | null;
  timing: Timing | null;
}

/**
 * The reviews one browser sent, by trip slug; {} without the database, null when the id is not one of ours.
 * Reads the whole table (its key starts with the trip): fine while it has hundreds of rows and each browser asks
 * once; give it an index on `reviewer` before it has tens of thousands.
 */
export async function ownReviews(reviewer: unknown): Promise<Record<string, OwnReview> | null> {
  if (typeof reviewer !== "string" || !REVIEWER.test(reviewer)) return null;
  const d = await db();
  if (!d) return {};
  const { results } = await d
    .prepare(`SELECT slug, stars, fit, crowded, timing FROM review WHERE reviewer = ?1 LIMIT ${OWN_MAX}`)
    .bind(reviewer)
    .all<{ slug: string; stars: number; fit: string | null; crowded: number | null; timing: string | null }>();
  return Object.fromEntries(
    results.map((r) => [
      r.slug,
      {
        stars: r.stars,
        fit: FITS.includes(r.fit as Fit) ? (r.fit as Fit) : null,
        crowded: r.crowded === null ? null : r.crowded === 1,
        timing: TIMINGS.includes(r.timing as Timing) ? (r.timing as Timing) : null,
      },
    ])
  );
}

/** Totals for one trip; null without the database. */
export async function reviewSummary(slug: string): Promise<ReviewSummary | null> {
  const d = await db();
  if (!d) return null;
  const row = await d
    .prepare(
      `SELECT COUNT(*) AS n, AVG(stars) AS avg, SUM(fit = 'popis') AS popis, SUM(fit = 'tazsie') AS tazsie,
              SUM(fit = 'lahsie') AS lahsie, SUM(crowded = 1) AS crowded FROM review WHERE slug = ?1`
    )
    .bind(slug)
    .first<{ n: number; avg: number | null; popis: number | null; tazsie: number | null; lahsie: number | null; crowded: number | null }>();
  const n = row?.n ?? 0;
  return {
    n,
    stars: n ? Math.round((row!.avg ?? 0) * 10) / 10 : 0,
    fit: { popis: row?.popis ?? 0, tazsie: row?.tazsie ?? 0, lahsie: row?.lahsie ?? 0 },
    crowded: row?.crowded ?? 0,
  };
}
