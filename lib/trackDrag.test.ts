import { describe, expect, it } from "vitest";
import { EDGE_ZONE, edgeScroll, latestThumbMin } from "@/lib/trackDrag";

describe("the latest time the thumb may be set to", () => {
  it("is 23:55 without a ride before the walk", () => {
    expect(latestThumbMin(0)).toBe(23 * 60 + 55);
  });

  it("is the ride earlier with one, so the walk starts on the same day", () => {
    expect(latestThumbMin(30)).toBe(23 * 60 + 25);
    // 33 minutes of ride: 23:20 + 0:33 = 23:53; 23:25 would start the walk at 23:58, still fine, but
    // the thumb moves in steps of five and must never pass midnight.
    for (const lead of [1, 7, 33, 59, 61, 125, 600]) {
      const max = latestThumbMin(lead);
      expect(max % 5).toBe(0);
      expect(max + lead).toBeLessThanOrEqual(24 * 60 - 5);
      expect(max + 5 + lead).toBeGreaterThan(24 * 60 - 5);
    }
  });

  it("never goes below midnight for an absurd ride", () => {
    expect(latestThumbMin(5000)).toBe(0);
  });
});

describe("scrolling the track along with the thumb", () => {
  const LEFT = 60;
  const RIGHT = 340;

  it("stays still in the middle", () => {
    expect(edgeScroll(200, 150, LEFT, RIGHT)).toBe(0);
  });

  it("stays still when the thumb is grabbed inside the edge zone and not moved (the track opens that way)", () => {
    expect(edgeScroll(82, 82, LEFT, RIGHT)).toBe(0);
  });

  it("stays still when a thumb grabbed near the left edge is dragged to the right (Peter's case)", () => {
    expect(edgeScroll(88, 82, LEFT, RIGHT)).toBe(0);
    expect(edgeScroll(100, 82, LEFT, RIGHT)).toBe(0);
  });

  it("scrolls left when it is dragged left there", () => {
    expect(edgeScroll(70, 82, LEFT, RIGHT)).toBeLessThan(0);
  });

  it("scrolls right near the right edge, faster the deeper in, never faster than at the edge", () => {
    const rim = edgeScroll(RIGHT - EDGE_ZONE + 1, 150, LEFT, RIGHT);
    const deep = edgeScroll(RIGHT - 4, 150, LEFT, RIGHT);
    const past = edgeScroll(RIGHT + 200, 150, LEFT, RIGHT);
    expect(rim).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(rim);
    expect(past).toBeGreaterThanOrEqual(deep);
    expect(past).toBeLessThanOrEqual(220);
  });

  it("does not scroll right for a thumb that came back from the right to where it was grabbed", () => {
    expect(edgeScroll(300, 300, LEFT, RIGHT)).toBe(0);
  });
});
