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

describe("photoFocus, self-hosted copies", () => {
  it("finds a listed photo by its safeName()d file name in a local path", () => {
    expect(photoFocus("/photos/c/0123456789-Bansk_C3_A1__C5_A0tiavnica_-_Nov_C3_BD_z_C3_A1mok1.jpg-500px.jpg")).toBe("50% 28%");
    expect(photoFocus("/photos/c/0123456789-Other_castle.jpg-500px.jpg")).toBeUndefined();
  });
});
