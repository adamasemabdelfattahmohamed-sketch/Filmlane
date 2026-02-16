/**
 * Utils Index - فهرس الأدوات المساعدة
 * أفان تيتر - منصة النسخة
 */

// Class Name utility
export { cn } from "./cn";

// Logger
export { logger, trackError, trackEvent } from "./logger";

// Storage utilities
export {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  loadJSON,
  saveJSON,
} from "./storage";

// Editor Styles
export { getFormatStyles, EDITOR_STYLE_FORMAT_IDS } from "./editor-styles";
export type { EditorStyleFormatId } from "./editor-styles";

// Paste Classifier
export { handlePaste, runPendingPasteConfirmations } from "./paste-classifier";

// Context Memory Manager
export { ContextMemoryManager } from "./context-memory-manager";

export type {
  ClassificationRecord,
  ContextMemory,
} from "./context-memory-manager";

export type { EnhancedContextMemory } from "./context-memory-manager";

// Arabic Patterns
export {
  FULL_ACTION_VERB_SET,
  DIALECT_PATTERNS,
  NEGATION_PATTERNS,
  detectDialect,
} from "./arabic-patterns";

// Context Window + Hybrid Classifier (Single Source)
export {
  createContextWindow,
  trackDialogueBlock,
  detectPattern,
  addLineRelation,
  updateConfidence,
  getActiveDialogueBlock,
  HybridClassifier,
} from "./classification-core";
export type {
  DialogueBlock,
  LineRelation,
  ContextWindow,
  HybridResult,
} from "./classification-core";

// Feedback Collector
export { FeedbackCollector } from "./feedback-collector";

// Exporters
export {
  exportToFountain,
  exportToPDF,
  exportToDocx,
  downloadFile,
} from "./exporters";

// File Import Preprocessing
export {
  preprocessImportedTextForClassifier,
  normalizeDocTextFromAntiword,
  computeImportedTextQualityScore,
} from "./file-import-preprocessor";

// File Open Pipeline
export {
  buildFileOpenPipelineAction,
  type FileOpenPipelineAction,
} from "./file-open-pipeline";

// File Operations
export {
  saveScreenplay,
  loadScreenplay,
  openTextFile,
  openDocxFile,
  saveTextFile,
} from "./file-operations";

export type { ScreenplayData } from "./file-operations";

// Screenplay Rules
export { getNextFormatOnTab, getNextFormatOnEnter } from "./screenplay-rules";

// Text Utilities (canonical source)
export {
  normalizeLine,
  normalizeCharacterName,
  stripLeadingBullets,
  cleanInvisibleChars,
  cssObjectToString,
  isActionWithDash,
  isActionVerbStart,
  matchesActionStartPattern,
  hasActionVerbStructure,
  isActionCueLine,
  isImperativeStart,
  hasSentencePunctuation,
} from "./text-utils";

// Photo Montage Helpers
export {
  PHOTO_MONTAGE_LABEL,
  toPhotoMontageSceneHeaderText,
  isSceneHeaderOneLine,
  applyPhotoMontageToSceneHeaderLine,
} from "./photo-montage";

// Document Model / Payload
export {
  SCREENPLAY_PAYLOAD_VERSION,
  SCREENPLAY_PAYLOAD_TOKEN,
  buildPayloadMarker,
  extractEncodedPayloadMarker,
  encodeScreenplayPayload,
  decodeScreenplayPayload,
  extractPayloadFromText,
  htmlToScreenplayBlocks,
  screenplayBlocksToHtml,
  createPayloadFromBlocks,
  createPayloadFromHtml,
  ensurePayloadChecksum,
} from "./document-model";
export type { ScreenplayBlock, ScreenplayPayloadV1 } from "./document-model";
