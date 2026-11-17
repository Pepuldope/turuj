import { describe, expect, it } from "vitest";
import { getHoveredPin, isHoverablePin, pinRowHover, setHoveredPin } from "./pinHover";

const touch = { pointerType: "touch" } as React.PointerEvent;
const mouse = { pointerType: "mouse" } as React.PointerEvent;

describe("pinHover", () => {
  it("knows which pins light up", () => {
    expect(isHoverablePin("poi-abc")).toBe(true);
    expect(isHoverablePin("pk-1")).toBe(true);
    expect(isHoverablePin("ts-2")).toBe(true);
    expect(isHoverablePin("th-1")).toBe(false);
    expect(isHoverablePin("goal")).toBe(false);
  });

  it("a row sets the hover for a mouse only, and leaving or a click clears it", () => {
    setHoveredPin(null);
    const h = pinRowHover("poi-x");
    h.onPointerEnter(touch);
    expect(getHoveredPin()).toBeNull();
    h.onPointerEnter(mouse);
    expect(getHoveredPin()).toBe("poi-x");
    h.onPointerLeave(touch);
    expect(getHoveredPin()).toBe("poi-x");
    h.onPointerLeave(mouse);
    expect(getHoveredPin()).toBeNull();
    h.onPointerEnter(mouse);
    h.onClickCapture();
    expect(getHoveredPin()).toBeNull();
  });
});
