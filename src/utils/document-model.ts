import {
  EDITOR_STYLE_FORMAT_IDS,
  type EditorStyleFormatId,
} from "./editor-styles";

export interface ScreenplayBlock {
  formatId: EditorStyleFormatId;
  text: string;
}

export interface ScreenplayPayloadV1 {
  version: 1;
  blocks: ScreenplayBlock[];
  font: string;
  size: string;
  checksum: string;
  createdAt: string;
}

export const SCREENPLAY_PAYLOAD_VERSION = 1 as const;
export const SCREENPLAY_PAYLOAD_TOKEN = "FILMLANE_PAYLOAD_V1" as const;

const MARKER_RE = new RegExp(
  String.raw`\[\[${SCREENPLAY_PAYLOAD_TOKEN}:([A-Za-z0-9+/=]+)\]\]`,
  "u"
);
const FORMAT_ID_SET = new Set<string>(EDITOR_STYLE_FORMAT_IDS);

const normalizeBlockText = (value: string): string =>
  (value ?? "").replace(/\u00A0/g, " ").replace(/\r/g, "");

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const utf8ToBase64 = (value: string): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf-8").toString("base64");
  }
  // Browser fallback
  return btoa(unescape(encodeURIComponent(value)));
};

const base64ToUtf8 = (value: string): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf-8");
  }
  // Browser fallback
  return decodeURIComponent(escape(atob(value)));
};

const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const isEditorStyleFormatId = (value: string): value is EditorStyleFormatId =>
  FORMAT_ID_SET.has(value);

const getFormatIdFromElement = (
  element: Element
): EditorStyleFormatId | null => {
  const classNames = Array.from(element.classList);
  for (const className of classNames) {
    if (!className.startsWith("format-")) continue;
    const rawId = className.slice("format-".length);
    if (isEditorStyleFormatId(rawId)) {
      return rawId;
    }
  }
  return null;
};

const splitLegacyTopLineText = (
  text: string
): Array<{ formatId: "scene-header-1" | "scene-header-2"; text: string }> => {
  const normalized = normalizeBlockText(text).replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const pairMatch = normalized.match(
    /^((?:مشهد|scene)\s*[0-9٠-٩]+)\s*(?:[-–—:،]\s*|\s+)(.+)$/iu
  );
  if (pairMatch) {
    return [
      { formatId: "scene-header-1", text: pairMatch[1].trim() },
      { formatId: "scene-header-2", text: pairMatch[2].trim() },
    ];
  }

  if (/^(?:مشهد|scene)\s*[0-9٠-٩]+/iu.test(normalized)) {
    return [{ formatId: "scene-header-1", text: normalized }];
  }

  return [{ formatId: "scene-header-2", text: normalized }];
};

const normalizeIncomingBlocks = (blocks: ScreenplayBlock[]): ScreenplayBlock[] => {
  const normalizedBlocks: ScreenplayBlock[] = [];
  for (const block of blocks) {
    if (block.formatId === "scene-header-top-line") {
      normalizedBlocks.push(...splitLegacyTopLineText(block.text));
      continue;
    }

    normalizedBlocks.push({
      formatId: block.formatId,
      text: normalizeBlockText(block.text),
    });
  }

  return normalizedBlocks;
};

const toLineTextsFromNode = (element: Element): string[] => {
  const rawText =
    element instanceof HTMLElement && typeof element.innerText === "string"
      ? element.innerText
      : element.textContent || "";
  const lines = normalizeBlockText(rawText)
    .split("\n")
    .map((line) => line.trim());

  if (lines.length === 0) return [""];
  return lines;
};

const computePayloadChecksum = (
  payload: Omit<ScreenplayPayloadV1, "checksum">
): string => {
  return fnv1a(JSON.stringify(payload));
};

export const ensurePayloadChecksum = (
  payload: Omit<ScreenplayPayloadV1, "checksum"> & {
    checksum?: string;
  }
): ScreenplayPayloadV1 => {
  const unsignedPayload = {
    version: SCREENPLAY_PAYLOAD_VERSION,
    blocks: normalizeIncomingBlocks(payload.blocks),
    font: payload.font,
    size: payload.size,
    createdAt: payload.createdAt,
  } as const;
  return {
    ...unsignedPayload,
    checksum: computePayloadChecksum(unsignedPayload),
  };
};

export const buildPayloadMarker = (encodedPayload: string): string =>
  `[[${SCREENPLAY_PAYLOAD_TOKEN}:${encodedPayload}]]`;

export const extractEncodedPayloadMarker = (text: string): string | null => {
  const match = (text ?? "").match(MARKER_RE);
  return match?.[1] ?? null;
};

export const encodeScreenplayPayload = (payload: ScreenplayPayloadV1): string =>
  utf8ToBase64(JSON.stringify(payload));

export const decodeScreenplayPayload = (
  encodedPayload: string
): ScreenplayPayloadV1 | null => {
  try {
    const decoded = base64ToUtf8(encodedPayload);
    const parsed = JSON.parse(decoded) as Partial<ScreenplayPayloadV1>;
    if (
      parsed?.version !== SCREENPLAY_PAYLOAD_VERSION ||
      !Array.isArray(parsed.blocks) ||
      typeof parsed.font !== "string" ||
      typeof parsed.size !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.checksum !== "string"
    ) {
      return null;
    }

    const sanitizedBlocks: ScreenplayBlock[] = [];
    for (const block of parsed.blocks) {
      if (
        !block ||
        typeof block !== "object" ||
        typeof block.formatId !== "string" ||
        !isEditorStyleFormatId(block.formatId) ||
        typeof block.text !== "string"
      ) {
        continue;
      }
      sanitizedBlocks.push({
        formatId: block.formatId,
        text: normalizeBlockText(block.text),
      });
    }

    const legacyChecksum = computePayloadChecksum({
      version: SCREENPLAY_PAYLOAD_VERSION,
      blocks: sanitizedBlocks,
      font: parsed.font,
      size: parsed.size,
      createdAt: parsed.createdAt,
    });

    const rebuilt = ensurePayloadChecksum({
      version: SCREENPLAY_PAYLOAD_VERSION,
      blocks: sanitizedBlocks,
      font: parsed.font,
      size: parsed.size,
      createdAt: parsed.createdAt,
    });

    if (rebuilt.checksum !== parsed.checksum && legacyChecksum !== parsed.checksum) {
      return null;
    }

    return rebuilt;
  } catch {
    return null;
  }
};

export const extractPayloadFromText = (
  text: string
): ScreenplayPayloadV1 | null => {
  const encoded = extractEncodedPayloadMarker(text);
  if (!encoded) return null;
  return decodeScreenplayPayload(encoded);
};

export const htmlToScreenplayBlocks = (html: string): ScreenplayBlock[] => {
  if (!html || !html.trim()) return [];
  if (typeof DOMParser === "undefined") return [];

  const parser = new DOMParser();
  const documentRef = parser.parseFromString(
    `<div id="screenplay-model-root">${html}</div>`,
    "text/html"
  );
  const root = documentRef.getElementById("screenplay-model-root");
  if (!root) return [];

  const blocks: ScreenplayBlock[] = [];

  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textLines = normalizeBlockText(node.textContent || "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      for (const line of textLines) {
        blocks.push({ formatId: "action", text: line });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const formatId = getFormatIdFromElement(element) ?? "action";

    if (formatId === "scene-header-top-line") {
      const directChildren = Array.from(element.children);
      const sceneHeader1 = directChildren.find((child) =>
        child.classList.contains("format-scene-header-1")
      );
      const sceneHeader2 = directChildren.find((child) =>
        child.classList.contains("format-scene-header-2")
      );

      if (sceneHeader1) {
        for (const line of toLineTextsFromNode(sceneHeader1)) {
          blocks.push({ formatId: "scene-header-1", text: line });
        }
      }
      if (sceneHeader2) {
        for (const line of toLineTextsFromNode(sceneHeader2)) {
          blocks.push({ formatId: "scene-header-2", text: line });
        }
      }
      if (!sceneHeader1 && !sceneHeader2) {
        blocks.push(...splitLegacyTopLineText(element.textContent || ""));
      }
      return;
    }

    for (const line of toLineTextsFromNode(element)) {
      blocks.push({ formatId, text: line });
    }
  });

  return normalizeIncomingBlocks(blocks);
};

export const screenplayBlocksToHtml = (blocks: ScreenplayBlock[]): string => {
  const normalized = normalizeIncomingBlocks(
    (blocks ?? []).filter(
      (block): block is ScreenplayBlock =>
        Boolean(block) &&
        typeof block.text === "string" &&
        typeof block.formatId === "string" &&
        isEditorStyleFormatId(block.formatId)
    )
  );

  const html: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];
    const next = normalized[i + 1];

    if (
      current.formatId === "scene-header-1" &&
      next &&
      next.formatId === "scene-header-2"
    ) {
      const topText = normalizeBlockText(current.text);
      const bottomText = normalizeBlockText(next.text);
      html.push(
        `<div class="format-scene-header-top-line"><div class="format-scene-header-1">${
          topText.length > 0 ? escapeHtml(topText) : "<br>"
        }</div><div class="format-scene-header-2">${
          bottomText.length > 0 ? escapeHtml(bottomText) : "<br>"
        }</div></div>`
      );
      i++;
      continue;
    }

    const text = normalizeBlockText(current.text);
    const htmlText = text.length > 0 ? escapeHtml(text).replace(/\n/g, "<br>") : "<br>";
    html.push(`<div class="format-${current.formatId}">${htmlText}</div>`);
  }

  return html.join("");
};

export const createPayloadFromBlocks = (
  blocks: ScreenplayBlock[],
  options?: {
    font?: string;
    size?: string;
    createdAt?: string;
  }
): ScreenplayPayloadV1 => {
  return ensurePayloadChecksum({
    version: SCREENPLAY_PAYLOAD_VERSION,
    blocks: normalizeIncomingBlocks(blocks),
    font: options?.font ?? "AzarMehrMonospaced-San",
    size: options?.size ?? "12pt",
    createdAt: options?.createdAt ?? new Date().toISOString(),
  });
};

export const createPayloadFromHtml = (
  html: string,
  options?: {
    font?: string;
    size?: string;
    createdAt?: string;
  }
): ScreenplayPayloadV1 => {
  const blocks = htmlToScreenplayBlocks(html);
  return createPayloadFromBlocks(blocks, options);
};
