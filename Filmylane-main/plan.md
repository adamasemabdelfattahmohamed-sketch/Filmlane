Plan

خطة تنفيذ 1:1 لتصنيف المحتوى عند فتح/إدراج الملفات مع دعم OCR (Mistral OCR 3)
ملخص
سنجعل مسار فتح/إدراج الملفات يمر بنفس منطق paste-classifier حرفيًا (1:1) بدل أي تصنيف جديد منفصل.
سنضيف مسارين واضحين في الواجهة:
فتح ملف = استبدال كامل محتوى المحرر.
إدراج ملف = إدراج عند موضع المؤشر.
الصيغ المستهدفة: .doc, .docx, .txt, .pdf مع الإبقاء على .fountain, .fdx.
PDF الممسوح سيستخدم OCR من Mistral بشكل هجين (Text extraction أولًا ثم OCR عند الحاجة).
.doc سيأخذ أعلى أولوية مع سلسلة fallback متعددة لتقليل الفشل لأقصى حد.
نطاق التنفيذ (Decision Complete)
تعديل ScreenplayEditor.tsx لإضافة:
handleOpenFile جديد يعتمد على extraction backend ثم يمرر النص إلى مسار paste 1:1.
handleInsertFile جديد (إدراج عند المؤشر) بنفس المسار.
action/menu item جديد: insert-file.
قبول الامتدادات: .doc,.docx,.txt,.pdf,.fountain,.fdx.
تعديل EditorArea.tsx بإضافة API داخل EditorHandle:
importClassifiedText(text: string, mode: "replace" | "insert"): Promise<void>.
داخليًا: إنشاء pseudo clipboard event واستدعاء newHandlePaste(...) نفسه الموجود حاليًا دون تغيير قواعد التصنيف.
إضافة route جديد للخادم:
route.ts.
مسؤول عن قراءة الملف واستخراج نص خام فقط.
يعيد JSON قياسي يحتوي النص + metadata عن طريقة الاستخراج وهل OCR تم استخدامه.
إضافة utility extraction:
file-extraction.ts (server-side logic).
file-import.ts لتعريف الأنواع التعاقدية.
السلوك الوظيفي النهائي
Open File:
يطلب الملف.
يرسل الملف إلى /api/files/extract.
يأخذ text.
ينفذ importClassifiedText(text, "replace").
النتيجة: نفس مخرجات اللصق 1:1 (classification, spacing, pending confirmations, memory updates, agent review hooks).
Insert File:
نفس الخطوات لكن mode = "insert" عند موضع المؤشر.
low-confidence confirmations:
مطابق للّصق 1:1 كما طلبت (كل شيء يحصل كأننا بنلصق نص).
تصميم الاستخراج لكل نوع ملف
txt/fountain/fdx:
قراءة bytes.
decode بالترتيب: utf-8 ثم windows-1256 ثم latin1.
normalize newlines.
docx:
mammoth.extractRawText.
pdf (Hybrid OCR policy):
محاولة استخراج نص عبر parser محلي (pdfjs-dist).
حساب كثافة النص.
إذا النص فارغ/ضعيف: تشغيل Mistral OCR.
إذا النص قوي: استخدام النص المحلي مباشرة.
إذا local parser فشل: OCR مباشرة.
doc (أولوية قصوى + fallbacks متعددة):
antiword عبر WSL من /usr/bin/antiword.
antiword عبر المسار الذي وفّرته: D:\aanalyze script\antiword-build\antiword (تشغيل عبر WSL مع quoting صحيح).
Word COM automation (Python win32com) لتحويل .doc إلى نص ثم القراءة.
Word COM automation لتحويل .doc إلى PDF ثم OCR عبر Mistral.
محاولة OCR مباشرة للملف كـ best-effort.
عند فشل كل ما سبق: رسالة خطأ مفصلة تشمل كل المحاولات التي تمت وأسباب فشلها.
دمج Mistral OCR 3
Environment:
MISTRAL_API_KEY (required).
MISTRAL_OCR_MODEL اختياري، الافتراضي: mistral-ocr-latest.
Flow:
POST /v1/files مع purpose=ocr وملف المستخدم.
POST /v1/ocr مع document.file_id وmodel.
دمج pages[].markdown في نص واحد.
إدارة الأخطاء:
timeout واضح.
retry بسيط للشبكة.
fallback للطرق المحلية إن أمكن.
تغييرات API/Interfaces العامة
file-import.ts:
FileImportMode = "replace" | "insert".
ImportedFileType = "doc" | "docx" | "txt" | "pdf" | "fountain" | "fdx".
FileExtractionResult يحتوي:
text: string
fileType: ImportedFileType
method: "native-text" | "antiword" | "word-com" | "ocr-mistral"
usedOcr: boolean
warnings: string[]
attempts: string[]
EditorHandle في EditorArea.tsx:
إضافة importClassifiedText(...) كما سبق.
menu action IDs في ScreenplayEditor.tsx:
إضافة "insert-file".
التحقق والاختبارات
Unit tests لاستخراج الملفات:
docx extraction success.
txt encoding fallback (windows-1256).
pdf local-text path.
pdf OCR-trigger path.
Unit tests لسلسلة fallback الخاصة بـ .doc:
فشل antiword ثم نجاح Word COM.
فشل Word COM النصي ثم نجاح تحويل PDF+OCR.
فشل كل المسارات وإرجاع خطأ مفصل.
Integration tests (DOM) لضمان 1:1:
open يستبدل المحتوى.
insert يضيف عند المؤشر.
كلاهما يمر عبر handlePaste نفسه (pseudo clipboard event).
low-confidence confirmations تُنتج نفس السلوك الحالي.
فحوصات المشروع قبل التسليم:
pnpm test
pnpm typecheck
pnpm lint:ci
الافتراضات والاختيارات الافتراضية
اعتمادنا أن سلوك التطبيقات المشابهة: Open = Replace وInsert/Import = Insert، وتم اعتماد تنفيذ الاثنين.
OCR policy المعتمدة: Hybrid detect+OCR.
.doc هو أعلى أولوية: سيتم تنفيذ fallback ladder كاملة بدل الفشل المبكر.
في بيئات لا تحتوي Word COM أو antiword، سيتم تخطي المسار غير المتاح تلقائيًا مع الاستمرار لباقي fallback.
إذا غاب MISTRAL_API_KEY سيتم الإبقاء على المسارات المحلية، وOCR سيُعطي رسالة إعداد واضحة بدل crash.

---

## Runbook (تحديث التنفيذ الجذري)

### Antiword Build
1. Windows-first:
`pnpm run build:antiword:windows`
2. Linux (WSL) binary:
`pnpm run build:antiword:linux`
3. Hybrid wrapper:
`pnpm run build:antiword`

### DOC extraction fallback order
1. antiword (نسخة التطبيق المدمجة - Windows `antiword.exe`)
2. antiword (نسخة التطبيق المدمجة - Linux داخل WSL)
3. antiword (`/usr/bin/antiword` داخل WSL)
4. Word COM automation (نص مباشر)
5. Word COM -> PDF -> Mistral OCR

### PDF extraction policy
1. محاولة استرجاع payload التطبيق من PDF metadata/hidden marker.
2. local parser (Node-safe) بدون الاعتماد على worker bundling.
3. إن كان النص ضعيفًا أو فشل parser: Mistral OCR (Primary في الإنتاج).

### Regression Results (12.doc / 12.docx / 12.pdf)
| Fixture | Method | Score (formatAgreementScore) | Fallback Used | Pass/Fail |
| --- | --- | --- | --- | --- |
| `12.doc` | `antiword (Windows bundled)` | `0.983` | `No` | `PASS` |
| `12.docx` | `mammoth` + structured block parser | `0.974` | `No` | `PASS` |
| `12.pdf` | `pdf-local (RTL-aware line reconstruction)` | `0.950` | `No` | `PASS` |

ملاحظات:
- القياس على baseline: `tests/fixtures/regression/12.paste-baseline.blocks.json`.
- gate المستهدف تحقق بالكامل: `doc >= 0.95`, `docx >= 0.95`, `pdf >= 0.90`.
