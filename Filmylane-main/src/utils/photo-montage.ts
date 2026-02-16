const PHOTO_MONTAGE_RE = /\(\s*فوتومونتاج\s*\)\s*$/u;
const TRAILING_COLON_RE = /[:：]\s*$/u;

export const PHOTO_MONTAGE_LABEL = "(فوتومونتاج)";

export const toPhotoMontageSceneHeaderText = (value: string): string => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return `مشهد ${PHOTO_MONTAGE_LABEL}`;
  }

  const withoutColon = normalized.replace(TRAILING_COLON_RE, "").trim();
  const canonicalBase = withoutColon.replace(PHOTO_MONTAGE_RE, "").trim();
  if (!canonicalBase) {
    return `مشهد ${PHOTO_MONTAGE_LABEL}`;
  }

  return `${canonicalBase} ${PHOTO_MONTAGE_LABEL}`;
};

export const isSceneHeaderOneLine = (
  lineElement: HTMLElement | null
): lineElement is HTMLDivElement => {
  if (!lineElement) return false;
  return lineElement.classList.contains("format-scene-header-1");
};

export const applyPhotoMontageToSceneHeaderLine = (
  lineElement: HTMLElement | null
): boolean => {
  if (!isSceneHeaderOneLine(lineElement)) return false;
  lineElement.textContent = toPhotoMontageSceneHeaderText(
    lineElement.textContent || ""
  );
  return true;
};
