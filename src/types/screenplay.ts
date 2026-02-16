import type { LucideIcon } from "lucide-react";

/**
 * @description
 * تنسيقات السيناريو - Screenplay Formats
 * تعرّف تنسيقات العرض المختلفة لعناصر السيناريو في محرر "أفان تيتر"
 *
 * @responsibilities
 * - تعريف التنسيقات البصرية لكل نوع عنصر سينمائي
 * - توفير اختصارات لوحة المفاتيح للتنسيق السريع
 * - تحديد الألوان والأيقونات المرتبطة بكل تنسيق
 *
 * @example
 * ```typescript
 * const actionFormat: ScreenplayFormat = {
 *   id: 'action',
 *   label: 'إجراء',
 *   shortcut: 'Ctrl+2',
 *   color: '#94a3b8',
 *   icon: TextIcon
 * };
 * ```
 */
export interface ScreenplayFormat {
  id: string;
  label: string;
  shortcut: string;
  color: string;
  icon: LucideIcon;
}

/**
 * @description
 * إحصائيات المستند - Document Statistics
 * توفر معلومات كمية عن محتوى السيناريو الحالي
 *
 * @responsibilities
 * - حساب عدد الكلمات والحروف في السيناريو
 * - تقدير عدد الصفحات (1 صفحة ≈ 500 كلمة)
 * - عدد المشاهد المكتشفة
 *
 * @example
 * ```typescript
 * const stats: DocumentStats = {
 *   words: 12500,
 *   characters: 72000,
 *   pages: 25,
 *   scenes: 45
 * };
 * ```
 */
export interface DocumentStats {
  words: number; // عدد الكلمات
  characters: number; // عدد الحروف
  pages: number; // عدد الصفحات
  scenes: number; // عدد المشاهد
}

/**
 * @description
 * خيارات الخطوط - Font Options
 * تعريف الخطوط المتاحة في المحرر مع التركيز على الخطوط العربية
 *
 * @responsibilities
 * - توفير قائمة الخطوط المتاحة للمستخدم
 * - دعم الخطوط العربية (Cairo, AzarMehrMonospaced)
 *
 * @example
 * ```typescript
 * const arabicFont: FontOption = {
 *   value: 'Cairo',
 *   label: 'الخط العربي (Cairo)'
 * };
 * ```
 */
export interface FontOption {
  value: string; // قيمة الخط (font-family name)
  label: string; // الاسم المعروض
}

/**
 * @description
 * خيارات حجم النص - Text Size Options
 * أحجام الخطوط المتاحة للعرض والتحرير
 *
 * @responsibilities
 * - توفير أحجام قياسية متوافقة مع معايير السيناريو
 * - دعم أحجام القراءة المريحة (12pt - 14pt)
 *
 * @example
 * ```typescript
 * const standardSize: TextSizeOption = {
 *   value: '12pt',
 *   label: '12 نقطة (قياسي)'
 * };
 * ```
 */
export interface TextSizeOption {
  value: string; // قيمة الحجم (e.g., '12pt')
  label: string; // الاسم المعروض
}

/**
 * @description
 * سجل التصنيف - Classification Record
 * يستخدم لتتبع تصنيفات السطور بواسطة نظام التصنيف (AI أو Manual)
 *
 * @responsibilities
 * - تسجيل كل سطر تم تصنيفه مع التصنيف المُعَيَّن
 * - توفير بيانات التدريب لتحسين النظام
 * - تتبع أداء التصنيف عبر الزمن
 *
 * @example
 * ```typescript
 * const record: ClassificationRecord = {
 *   line: 'أحمد: مرحباً بك',
 *   classification: 'dialogue',
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface ClassificationRecord {
  line: string; // نص السطر
  classification: string; // التصنيف (action, dialogue, etc.)
  timestamp: number; // الوقت (Unix timestamp)
}

/**
 * @description
 * تصحيح المستخدم - User Correction
 * يستخدم لتتبع تصحيحات المستخدم للتصنيفات التلقائية
 *
 * @responsibilities
 * - تسجيل التصحيحات لتحسين دقة النظام المستقبلية
 * - حساب مستوى الثقة بعد التصحيح
 * - بناء قاعدة بيانات تصحيحات للتعلم
 *
 * @example
 * ```typescript
 * const correction: Correction = {
 *   line: 'يدخل أحمد',
 *   originalType: 'dialogue',
 *   correctedType: 'action',
 *   confidence: 0.95,
 *   timestamp: Date.now()
 * };
 * ```
 */
export interface Correction {
  line: string; // نص السطر
  originalType: string; // التصنيف الأصلي
  correctedType: string; // التصنيف المصحح
  confidence: number; // مستوى الثقة
  timestamp: number; // وقت التصحيح
}

/**
 * @description
 * ذاكرة السياق - Context Memory
 * تحافظ على معلومات الجلسة لتحسين التصنيف التلقائي
 *
 * @responsibilities
 * - تتبع الشخصيات الشائعة في السيناريو
 - تخزين المواقع المتكررة (INT./EXT.)
 * - حفظ سجل الحوارات لكل شخصية
 * - تحسين الدقة بناءً على السياق التاريخي
 *
 * @example
 * ```typescript
 * const memory: ContextMemory = {
 *   sessionId: 'sess-123',
 *   lastModified: Date.now(),
 *   data: {
 *     commonCharacters: ['أحمد', 'فاطمة'],
 *     commonLocations: ['غرفة المعيشة', 'الشارع'],
 *     lastClassifications: ['scene-header-1', 'action'],
 *     characterDialogueMap: { 'أحمد': 15, 'فاطمة': 12 }
 *   }
 * };
 * ```
 */
export interface ContextMemory {
  sessionId: string; // معرّف الجلسة
  lastModified: number; // آخر تعديل (Unix timestamp)
  data: {
    commonCharacters: string[]; // الشخصيات الشائعة
    commonLocations: string[]; // الأماكن الشائعة
    lastClassifications: string[]; // آخر التصنيفات
    characterDialogueMap: { [character: string]: number }; // عدد حوارات كل شخصية
  };
}

/**
 * @description
 * سياق السطر - Line Context
 * معلومات السياق المحيطة بالسطر الحالي للمساعدة في التصنيف الدقيق
 *
 * @responsibilities
 * - توفير الأسطر السابقة واللاحقة للتحلل السياقي
 * - حساب إحصائيات نصية للسطر (عدد الكلمات، العلامات الترقيمية)
 * - تحديد الأنماط المحيطة (هل السطر داخل حوار؟ بعد عنوان مشهد؟)
 *
 * @example
 * ```typescript
 * const context: LineContext = {
 *   previousLines: ['أحمد:', '(بابتسامة)'],
 *   currentLine: 'مرحباً بك',
 *   nextLines: [''],
 *   previousTypes: ['character', 'parenthetical'],
 *   stats: { wordCount: 2, charCount: 10, hasColon: false, ... },
 *   pattern: { isInDialogueBlock: true, isInSceneHeader: false, ... }
 * };
 * ```
 */
export interface LineContext {
  previousLines: string[]; // الأسطر السابقة
  currentLine: string; // السطر الحالي
  nextLines: string[]; // الأسطر التالية
  previousTypes: string[]; // أنواع الأسطر السابقة

  stats: {
    wordCount: number; // عدد الكلمات
    charCount: number; // عدد الحروف
    hasColon: boolean; // هل يحتوي على نقطتين رأسيتين (:)
    hasPunctuation: boolean; // هل يحتوي على علامات ترقيم
    startsWithBullet: boolean; // هل يبدأ برمز نقطي
    isShort: boolean; // هل السطر قصير
    isLong: boolean; // هل السطر طويل
  };

  pattern: {
    isInDialogueBlock: boolean; // هل داخل بلوك حوار
    isInSceneHeader: boolean; // هل داخل عنوان مشهد
    lastSceneDistance: number; // المسافة من آخر عنوان مشهد
    lastCharacterDistance: number; // المسافة من آخر اسم شخصية
  };
}

/**
 * @description
 * خيارات التصدير - Export Options
 * إعدادات تصدير السيناريو بصيغ مختلفة
 *
 * @responsibilities
 * - تعريف الصيغ المدعومة للتصدير
 * - تحديد خيارات التنسيق (الخط، الحجم، أرقام الصفحات)
 * - دعم صفحة العنوان الاختيارية
 *
 * @example
 * ```typescript
 * const exportOptions: ExportOptions = {
 *   format: 'pdf',
 *   includePageNumbers: true,
 *   includeTitlePage: true,
 *   font: 'Cairo',
 *   fontSize: '12pt'
 * };
 * ```
 */
export interface ExportOptions {
  format: "pdf" | "docx" | "fountain" | "fdx" | "html";
  includePageNumbers: boolean;
  includeTitlePage: boolean;
  font?: string;
  fontSize?: string;
}

/**
 * @description
 * معلومات العنوان - Title Page Info
 * بيانات صفحة العنوان في السيناريو
 *
 * @responsibilities
 * - تخزين معلومات العنوان والمؤلف
 * - دعم حقول اختيارية (مبني على، معلومات التواصل)
 * - توافق مع معايير صناعة السيناريو
 *
 * @example
 * ```typescript
 * const titleInfo: TitlePageInfo = {
 *   title: 'رحلة الأمل',
 *   author: 'أحمد خالد',
 *   basedOn: 'رواية "الأمل"',
 *   draft: 'النسخة الثالثة',
 *   date: '2025-02-08'
 * };
 * ```
 */
export interface TitlePageInfo {
  title: string; // عنوان السيناريو
  author: string; // اسم الكاتب
  basedOn?: string; // مبني على (اختياري)
  contact?: string; // معلومات التواصل
  draft?: string; // رقم المسودة
  date?: string; // التاريخ
}

/**
 * @description
 * إعدادات المحرر - Editor Settings
 * تفضيلات المستخدم لتخصيص تجربة التحرير
 *
 * @responsibilities
 * - تخزين إعدادات العرض (الخط، الحجم، ارتفاع السطر)
 * - إدارة الحفظ التلقائي ومدته
 * - تفضيلات السمة (فاتح/داكن) واللغة
 *
 * @example
 * ```typescript
 * const settings: EditorSettings = {
 *   font: 'Cairo',
 *   fontSize: '12pt',
 *   lineHeight: '1.5',
 *   autoSave: true,
 *   autoSaveInterval: 30,
 *   spellCheck: true,
 *   showPageNumbers: true,
 *   theme: 'dark',
 *   language: 'ar'
 * };
 * ```
 */
export interface EditorSettings {
  font: string; // خط المحرر
  fontSize: string; // حجم الخط
  lineHeight: string; // ارتفاع السطر
  autoSave: boolean; // حفظ تلقائي
  autoSaveInterval: number; // فترة الحفظ التلقائي (بالثواني)
  spellCheck: boolean; // التدقيق الإملائي
  showPageNumbers: boolean; // إظهار أرقام الصفحات
  theme: "light" | "dark"; // السمة
  language: "ar" | "en"; // اللغة
}

/**
 * @description
 * معلومات المشهد - Scene Info
 * بيانات تفصيلية عن كل مشهد في السيناريو
 *
 * @responsibilities
 * - تخزين معلومات المشهد (الرقم، الموقع، الوقت)
 * - تتبع الشخصيات الموجودة في المشهد
 * - تقدير مدة المشهد (لجدولة الإنتاج)
 *
 * @example
 * ```typescript
 * const scene: SceneInfo = {
 *   id: 'scene-1',
 *   number: 1,
 *   heading: 'INT. غرفة المعيشة - يوم',
 *   location: 'غرفة المعيشة',
 *   timeOfDay: 'يوم',
 *   pageNumber: 1,
 *   duration: 2,
 *   characters: ['أحمد', 'فاطمة']
 * };
 * ```
 */
export interface SceneInfo {
  id: string; // معرّف المشهد
  number: number; // رقم المشهد
  heading: string; // عنوان المشهد (INT./EXT.)
  location: string; // الموقع
  timeOfDay: string; // وقت اليوم (DAY/NIGHT)
  pageNumber: number; // رقم الصفحة
  duration?: number; // المدة المقدرة (بالدقائق)
  characters?: string[]; // الشخصيات في المشهد
}

/**
 * @description
 * معلومات الشخصية - Character Info
 * بيانات تفصيلية عن كل شخصية في السيناريو
 *
 * @responsibilities
 * - تتبع عدد الحوارات لكل شخصية
 * - تسجيل المشاهد التي تظهر فيها الشخصية
 * - تخزين وصف الشخصية (اختياري)
 *
 * @example
 * ```typescript
 * const character: CharacterInfo = {
 *   name: 'أحمد',
 *   dialogueCount: 45,
 *   scenes: [1, 3, 5, 8],
 *   description: 'بطل القصة، شاب في الثلاثينيات'
 * };
 * ```
 */
export interface CharacterInfo {
  name: string; // اسم الشخصية
  dialogueCount: number; // عدد الحوارات
  scenes: number[]; // أرقام المشاهد التي تظهر فيها
  description?: string; // وصف الشخصية
}

/**
 * @description
 * نتيجة الذكاء الاصطناعي - AI Result
 * نتيجة عملية معالجة بواسطة AI
 *
 * @responsibilities
 * - توفير حالة النجاح/الفشل
 * - تخزين البيانات المُرجعة
 * - تسجيل رسائل الخطأ والاقتراحات
 *
 * @example
 * ```typescript
 * const result: AIResult = {
 *   success: true,
 *   data: { classifications: [...] },
 *   suggestions: ['تحسين 1', 'تحسين 2']
 * };
 * ```
 */
export interface AIResult {
  success: boolean; // هل نجحت العملية
  data?: unknown; // البيانات المرجعة
  error?: string; // رسالة الخطأ (إن وجد)
  suggestions?: string[]; // اقتراحات إضافية
}

/**
 * @description
 * حالة التحميل - Loading State
 * يُستخدم لعرض حالة العمليات غير المتزامنة
 *
 * @responsibilities
 * - إظهار/إخفاء مؤشر التحميل
 * - عرض نسبة التقدم (اختياري)
 * - عرض رسائل الحالة
 *
 * @example
 * ```typescript
 * const loadingState: LoadingState = {
 *   isLoading: true,
 *   progress: 45,
 *   message: 'جاري تصنيف السطور...'
 * };
 * ```
 */
export interface LoadingState {
  isLoading: boolean; // هل يتم التحميل
  progress?: number; // نسبة التقدم (0-100)
  message?: string; // رسالة الحالة
}

/**
 * @description
 * نوع الملف - File Type
 * الصيغ المدعومة لاستيراد/تصدير السيناريو
 *
 * @responsibilities
 * - تحديد الصيغ القابلة للاستيراد (Fountain, FDX, PDF, DOCX, TXT)
 * - تحديد الصيغ القابلة للتصدير
 *
 * @example
 * ```typescript
 * const importFormat: FileType = 'fountain';
 * const exportFormat: FileType = 'pdf';
 * ```
 */
export type FileType = "fountain" | "fdx" | "pdf" | "docx" | "txt" | "html";

/**
 * @description
 * حالة الحفظ - Save State
 * يُستخدم لإظهار حالة المستند الحالية
 *
 * @responsibilities
 * - إعلام المستخدم بحالة الحفظ
 * - منع فقدان البيانات غير المحفوظة
 *
 * @example
 * ```typescript
 * let saveState: SaveState = 'unsaved';
 * // بعد الحفظ:
 * saveState = 'saved';
 * ```
 */
export type SaveState = "saved" | "unsaved" | "saving" | "error";

/**
 * @description
 * نوع التنسيق - Format Type
 * أنواع العناصر السينمائية المدعومة في المحرر
 *
 * @responsibilities
 * - تعريف جميع أنواع عناصر السيناريو
 * - استخدامها في التصنيف والعرض والتصدير
 *
 * @example
 * ```typescript
 * const format: FormatType = 'dialogue';
 * ```
 */
export type FormatType =
  | "scene-header-1"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "shot"
  | "note";

/**
 * @description
 * نوع سطر التصنيف - Line Classification Type
 * جميع الأنواع التي يمكن أن يُرجعها نظام التصنيف
 *
 * @responsibilities
 * - توفير قائمة شاملة بأنواع السطور في السيناريو العربي
 * - دعم أنواع خاصة بالسيناريو العربي (بسم الله)
 * - استخدامها في التصنيف، العرض، والتحقق من التسلسل
 *
 * @example
 * ```typescript
 * const lineType: LineType = 'character';
 * // في التصنيف:
 * if (type === 'dialogue') { ... }
 * ```
 */
export type LineType =
  | "action"
  | "dialogue"
  | "character"
  | "scene-header-1"
  | "scene-header-2"
  | "scene-header-3"
  | "scene-header-top-line"
  | "transition"
  | "parenthetical"
  | "basmala";
