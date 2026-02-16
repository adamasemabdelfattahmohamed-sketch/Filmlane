import { describe, expect, it } from "vitest";

import {
  decodeScreenplayPayload,
  encodeScreenplayPayload,
  htmlToScreenplayBlocks,
  screenplayBlocksToHtml,
} from "./document-model";

describe("document-model", () => {
  it("parses scene header top line wrapper into scene-header-1 and scene-header-2 blocks", () => {
    const html =
      '<div class="format-scene-header-top-line"><div class="format-scene-header-1">مشهد 1</div><div class="format-scene-header-2">داخلي - بيت - نهار</div></div>';
    const blocks = htmlToScreenplayBlocks(html);
    expect(blocks).toEqual([
      { formatId: "scene-header-1", text: "مشهد 1" },
      { formatId: "scene-header-2", text: "داخلي - بيت - نهار" },
    ]);
  });

  it("rebuilds scene header pair as top-line wrapper html", () => {
    const html = screenplayBlocksToHtml([
      { formatId: "scene-header-1", text: "مشهد 3" },
      { formatId: "scene-header-2", text: "خارجي - شارع - ليل" },
      { formatId: "action", text: "وصف" },
    ]);
    expect(html).toContain("format-scene-header-top-line");
    expect(html).toContain("format-scene-header-1");
    expect(html).toContain("format-scene-header-2");
  });

  it("repairs legacy payload block scene-header-top-line into split blocks", () => {
    const legacyPayload = {
      version: 1,
      blocks: [
        { formatId: "scene-header-top-line", text: "مشهد1 نهار - داخلي" },
        { formatId: "action", text: "وصف" },
      ],
      font: "AzarMehrMonospaced-San",
      size: "12pt",
      createdAt: "2026-02-13T00:00:00.000Z",
      checksum: "x",
    };

    const unsigned = {
      ...legacyPayload,
      checksum: undefined,
    };

    const checksumSource = JSON.stringify({
      version: unsigned.version,
      blocks: unsigned.blocks,
      font: unsigned.font,
      size: unsigned.size,
      createdAt: unsigned.createdAt,
    });
    let hash = 0x811c9dc5;
    for (let i = 0; i < checksumSource.length; i++) {
      hash ^= checksumSource.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    const checksum = (hash >>> 0).toString(16).padStart(8, "0");

    const encoded = encodeScreenplayPayload({
      ...legacyPayload,
      checksum,
    });
    const decoded = decodeScreenplayPayload(encoded);

    expect(decoded?.blocks[0]).toEqual({
      formatId: "scene-header-1",
      text: "مشهد1",
    });
    expect(decoded?.blocks[1]).toEqual({
      formatId: "scene-header-2",
      text: "نهار - داخلي",
    });
  });
});
