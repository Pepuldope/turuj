import { describe, expect, it } from "vitest";
import { photoFocus } from "@/lib/photoFocus";

describe("photoFocus", () => {
  it("finds a listed photo in a Commons thumbnail URL and in an original's URL", () => {
    expect(photoFocus("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Bansk%C3%A1_%C5%A0tiavnica_-_Nov%C3%BD_z%C3%A1mok1.jpg/500px-Bansk%C3%A1_%C5%A0tiavnica_-_Nov%C3%BD_z%C3%A1mok1.jpg")).toBe("50% 28%");
    expect(photoFocus("https://upload.wikimedia.org/wikipedia/commons/c/c8/Hrussocivertanlegi2.jpg")).toBe("50% 35%");
  });
  it("keeps other photos centred", () => {
    expect(photoFocus("https://upload.wikimedia.org/wikipedia/commons/x/xy/Other_castle.jpg")).toBeUndefined();
    expect(photoFocus(null)).toBeUndefined();
  });
});
