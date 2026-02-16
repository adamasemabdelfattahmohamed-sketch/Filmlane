import { describe, expect, it } from "vitest";

import {
  applyPhotoMontageToSceneHeaderLine,
  isSceneHeaderOneLine,
  toPhotoMontageSceneHeaderText,
} from "./photo-montage";

describe("photo montage helpers", () => {
  it("converts scene header text to photo montage form", () => {
    expect(toPhotoMontageSceneHeaderText("مشهد 5:")).toBe(
      "مشهد 5 (فوتومونتاج)"
    );
    expect(toPhotoMontageSceneHeaderText("مشهد 12 ( فوتومونتاج )")).toBe(
      "مشهد 12 (فوتومونتاج)"
    );
  });

  it("applies only on scene-header-1 lines", () => {
    const sceneHeaderLine = document.createElement("div");
    sceneHeaderLine.className = "format-scene-header-1";
    sceneHeaderLine.textContent = "مشهد 9:";

    const actionLine = document.createElement("div");
    actionLine.className = "format-action";
    actionLine.textContent = "وصف";

    expect(isSceneHeaderOneLine(sceneHeaderLine)).toBe(true);
    expect(isSceneHeaderOneLine(actionLine)).toBe(false);

    expect(applyPhotoMontageToSceneHeaderLine(sceneHeaderLine)).toBe(true);
    expect(sceneHeaderLine.textContent).toBe("مشهد 9 (فوتومونتاج)");

    expect(applyPhotoMontageToSceneHeaderLine(actionLine)).toBe(false);
    expect(actionLine.textContent).toBe("وصف");
  });
});
