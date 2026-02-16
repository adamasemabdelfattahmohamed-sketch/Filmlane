import { Mistral } from '@mistralai/mistralai';
import * as fs from 'node:fs';
import 'dotenv/config';


// تهيئة العميل باستخدام مفتاح الـ API مع دعم المفاتيح الاحتياطية
const apiKey = process.env.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY_BACKUP;

if (!apiKey) {
    console.error("❌ خطأ: لا يوجد أي مفتاح API صالح في ملف .env");
    console.error("الرجاء التأكد من:");
    console.error("1. وجود ملف .env في نفس المجلد");
    console.error("2. احتواء الملف على: MISTRAL_API_KEY=your_valid_api_key");
    console.error("   أو: MISTRAL_API_KEY_BACKUP=your_backup_api_key");
    console.error("3. صلاحية المفتاح (يمكنك الحصول عليه من: https://console.mistral.ai/)");
    process.exit(1);
}

// إظهار المفتاح المستخدم (آخر 8 أحرف فقط للأمان)
const keyUsed = process.env.MISTRAL_API_KEY ? 'MISTRAL_API_KEY' : 'MISTRAL_API_KEY_BACKUP';
console.log(`🔑 استخدام المفتاح: ${keyUsed} (...${apiKey.slice(-8)})`);

const client = new Mistral({ apiKey: apiKey });

/**
 * دالة مساعدة لتحويل الملف إلى Base64
 * @param {string} filePath - مسار ملف الـ PDF
 * @returns {string} - السلسلة النصية المشفرة بـ Base64
 */
function encodeFile(filePath: string): string {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        return fileBuffer.toString('base64');
    } catch (error) {
        console.error("خطأ أثناء قراءة الملف:", (error as Error).message);
        throw error;
    }
}

/**
 * دالة لتحويل البيانات المستخرجة إلى نص منسق
 */
function isTransitionLine(text: string): boolean {
    return text.replace(/\s+/g, '') === 'قطع';
}

function extractTimeAndPlace(text: string): string | null {
    const match = text.match(/(نهار|ليل|صباح|مساء|فجر)\s*[-–]?\s*(داخلي|خارجي)/);
    if (!match) {
        return null;
    }
    return `${match[1]} -${match[2]}`;
}

function parseSceneHeading(sceneHeading: string | undefined, fallbackSceneNumber: number): { sceneNumber: number; timePlace: string } {
    const heading = (sceneHeading || '').trim();
    const numberMatch = heading.match(/مشهد\s*(\d+)/);
    const sceneNumber = numberMatch ? Number(numberMatch[1]) : fallbackSceneNumber;
    const timePlace = extractTimeAndPlace(heading) || '';
    return { sceneNumber, timePlace };
}

function isLikelyLocationLine(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) {
        return false;
    }

    if (trimmed.length <= 80 && /[-–]/.test(trimmed)) {
        return true;
    }

    return /^(شقة|منزل|بيت|فيلا|مكتب|العتبة|كوافير|كوايفير|شارع|مستشفى)/.test(trimmed);
}

type NormalizedScene = {
    sceneNumber: number;
    timePlace: string;
    location: string;
    content: Array<{ type: 'action' | 'dialogue'; text: string; speaker?: string }>;
    appendCut: boolean;
};

function normalizeScenes(data: any): NormalizedScene[] {
    const scenes = Array.isArray(data?.scenes) ? data.scenes : [];
    const normalized: NormalizedScene[] = [];
    let nextSceneNumber = 1;

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
        const scene = scenes[sceneIndex];
        const headingInfo = parseSceneHeading(scene?.scene_heading, scene?.scene_number ?? nextSceneNumber);
        let sceneNumber = headingInfo.sceneNumber;
        let timePlace = headingInfo.timePlace;
        let location = '';
        let currentContent: Array<{ type: 'action' | 'dialogue'; text: string; speaker?: string }> = [];
        let pendingCut = false;
        let expectingTimeAfterCut = false;
        let expectingLocation = false;

        if (sceneNumber >= nextSceneNumber) {
            nextSceneNumber = sceneNumber + 1;
        }

        const contentItems = Array.isArray(scene?.content) ? scene.content : [];
        for (const item of contentItems) {
            let text = typeof item?.text === 'string' ? item.text.trim() : '';
            if (!text) {
                continue;
            }

            if (item.type === 'action') {
                const trailingCut = text.match(/^(.*\S)\s+قطع$/);
                if (trailingCut) {
                    text = trailingCut[1].trim();
                    pendingCut = true;
                }
            }

            if (item.type === 'action' && isTransitionLine(text)) {
                pendingCut = true;
                expectingTimeAfterCut = true;
                expectingLocation = false;
                continue;
            }

            if (expectingTimeAfterCut && item.type === 'action') {
                const newTimePlace = extractTimeAndPlace(text);
                if (newTimePlace) {
                    normalized.push({
                        sceneNumber,
                        timePlace,
                        location,
                        content: currentContent,
                        appendCut: true
                    });

                    sceneNumber = nextSceneNumber++;
                    timePlace = newTimePlace;
                    location = '';
                    currentContent = [];
                    pendingCut = false;
                    expectingTimeAfterCut = false;
                    expectingLocation = true;
                    continue;
                }
            }

            if (expectingLocation && item.type === 'action') {
                location = text;
                expectingLocation = false;
                continue;
            }

            if (!location && item.type === 'action' && isLikelyLocationLine(text)) {
                location = text;
                continue;
            }

            if (item.type === 'dialogue') {
                const speaker = typeof item.speaker === 'string' ? item.speaker.trim() : '';
                currentContent.push({
                    type: 'dialogue',
                    speaker: speaker || undefined,
                    text
                });
            } else {
                currentContent.push({
                    type: 'action',
                    text
                });
            }
            expectingTimeAfterCut = false;
        }

        const hasNextExplicitScene = sceneIndex < scenes.length - 1;
        normalized.push({
            sceneNumber,
            timePlace,
            location,
            content: currentContent,
            appendCut: pendingCut || hasNextExplicitScene
        });
    }

    return normalized;
}

function formatScriptToText(data: any): string {
    const lines: string[] = [];
    lines.push('بسم الله الرحمن الرحيم {');

    const scenes = normalizeScenes(data);
    for (const scene of scenes) {
        lines.push(`${`مشهد${scene.sceneNumber}`}\t\t\t\t\t${scene.timePlace}`.trimEnd());
        if (scene.location) {
            lines.push(scene.location);
        }

        for (const item of scene.content) {
            if (item.type === 'dialogue') {
                if (item.speaker) {
                    lines.push(`• ${item.speaker} : ${item.text}`);
                } else {
                    lines.push(`• ${item.text}`);
                }
                continue;
            }

            lines.push(`- ${item.text}`);
        }

        if (scene.appendCut) {
            lines.push('قطع');
        }
    }

    return lines.join('\n');
}

function formatSchemaOutput(data: any): string {
    const lines: string[] = [];
    const scenes = normalizeScenes(data);

    if (scenes.length > 0) {
        lines.push('BASMALA = بسم الله الرحمن الرحيم');
    } else {
        lines.push('BASMALA = لا يوجد');
    }

    for (const scene of scenes) {
        lines.push(`SCENE-HEADER-1 = مشهد ${scene.sceneNumber}`);

        if (scene.timePlace) {
            lines.push(`SCENE-HEADER-2 = ${scene.timePlace}`);
        }

        if (scene.location) {
            lines.push(`SCENE-HEADER-3 = ${scene.location}`);
        }

        for (const item of scene.content) {
            if (item.type === 'dialogue') {
                if (item.speaker) {
                    lines.push(`CHARACTER = ${item.speaker} :`);
                }
                lines.push(`DIALOGUE = ${item.text}`);
                continue;
            }

            lines.push(`ACTION = ${item.text}`);
        }

        if (scene.appendCut) {
            lines.push('TRANSITION = قطع');
        }
    }

    return lines.join('\n');
}

/**
 * بعض الاستجابات قد تعود كسلسلة JSON متداخلة (string داخل string)
 * لذلك نحاول فكها عدة مرات بشكل آمن.
 */
function parseNestedJson(value: unknown): unknown {
    let current = value;

    for (let attempt = 0; attempt < 3 && typeof current === 'string'; attempt++) {
        const trimmed = current.trim();

        if (!trimmed) {
            break;
        }

        const looksLikeJson =
            trimmed.startsWith('{') ||
            trimmed.startsWith('[') ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'));

        if (!looksLikeJson) {
            break;
        }

        try {
            current = JSON.parse(trimmed);
        } catch {
            break;
        }
    }

    return current;
}

function hasScenesArray(data: unknown): data is { scenes: any[] } {
    return Boolean(data) && typeof data === 'object' && Array.isArray((data as any).scenes);
}

function buildTextOutput(data: unknown): string {
    if (hasScenesArray(data)) {
        const formatted = formatScriptToText(data);
        if (formatted.trim()) {
            return formatted;
        }
    }

    if (typeof data === 'string') {
        return data.trim() ? data : 'لم يتم استخراج نص صالح من الاستجابة.';
    }

    if (data && typeof data === 'object') {
        return JSON.stringify(data, null, 2);
    }

    return 'لم يتم استخراج بيانات صالحة.';
}

function buildSchemaOutput(data: unknown): string {
    if (hasScenesArray(data)) {
        const formatted = formatSchemaOutput(data);
        if (formatted.trim()) {
            return formatted;
        }
    }

    if (typeof data === 'string') {
        return data.trim() ? data : 'BASMALA = لا يوجد';
    }

    return 'BASMALA = لا يوجد';
}

type UnifiedSceneContent = {
    ACTION?: string;
    CHARACTER?: string;
    DIALOGUE?: string;
};

type UnifiedScene = {
    'SCENE-HEADER-1': string;
    'SCENE-HEADER-2'?: string;
    'SCENE-HEADER-3'?: string;
    CONTENT: UnifiedSceneContent[];
    TRANSITION?: 'قطع';
};

type UnifiedStructuredOutput = {
    BASMALA: string;
    SCENES: UnifiedScene[];
};

function buildStructuredJsonOutput(data: unknown): UnifiedStructuredOutput {
    if (!hasScenesArray(data)) {
        return {
            BASMALA: 'لا يوجد',
            SCENES: []
        };
    }

    const normalizedScenes = normalizeScenes(data);
    const scenes: UnifiedScene[] = normalizedScenes.map((scene) => {
        const content: UnifiedSceneContent[] = scene.content.map((item) => {
            if (item.type === 'dialogue') {
                if (item.speaker) {
                    return {
                        CHARACTER: `${item.speaker} :`,
                        DIALOGUE: item.text
                    };
                }

                return {
                    DIALOGUE: item.text
                };
            }

            return {
                ACTION: item.text
            };
        });

        const unifiedScene = {} as UnifiedScene;
        unifiedScene['SCENE-HEADER-1'] = `مشهد ${scene.sceneNumber}`;

        if (scene.timePlace) {
            unifiedScene['SCENE-HEADER-2'] = scene.timePlace;
        }

        if (scene.location) {
            unifiedScene['SCENE-HEADER-3'] = scene.location;
        }

        unifiedScene.CONTENT = content;

        if (scene.appendCut) {
            unifiedScene.TRANSITION = 'قطع';
        }

        return unifiedScene;
    });

    return {
        BASMALA: scenes.length > 0 ? 'بسم الله الرحمن الرحيم' : 'لا يوجد',
        SCENES: scenes
    };
}

// تعريف المخطط (Schema) لضمان استخراج البيانات بتنسيق JSON دقيق
const scriptSchema = {
    type: "json_schema" as const,
    jsonSchema: {
        name: "script_extraction",
        schemaDefinition: {
            type: "object",
            properties: {
                script_title: {
                    type: "string",
                    description: "عنوان السيناريو إن وجد"
                },
                scenes: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            scene_number: {
                                type: "integer",
                                description: "رقم المشهد"
                            },
                            scene_heading: {
                                type: "string",
                                description: "عنوان المشهد (مثل: مشهد 1، نهار داخلي)"
                            },
                            content: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        type: {
                                            type: "string",
                                            enum: ["action", "dialogue"],
                                            description: "نوع الفقرة: وصف حركي أو حوار"
                                        },
                                        speaker: {
                                            type: "string",
                                            nullable: true,
                                            description: "اسم الشخصية المتحدثة (فقط في حالة الحوار)"
                                        },
                                        text: {
                                            type: "string",
                                            description: "نص الحوار أو الوصف بعد التنظيف"
                                        }
                                    },
                                    required: ["type", "text"]
                                }
                            }
                        },
                        required: ["scene_heading", "content"]
                    }
                }
            },
            required: ["scenes"]
        }
    }
};

// البرومبت الهندسي المصمم لمعالجة أخطاء الـ OCR والتحيز اللغوي
const engineeringPrompt = `
أنت خبير OCR وتحليل سيناريوهات درامية.
المطلوب: استخراج المحتوى من PDF وإرجاع JSON فقط مطابق تمامًا للـ JSON Schema المرسل عبر documentAnnotationFormat.

قواعد إلزامية:
1) في عناوين المشاهد فقط: إذا ظهر "مسـ" أو "مس" قبل رقم المشهد، صححه إلى "مشهد".
2) استخراج حرفي للأسماء والنصوص: لا تصحح الأسماء لغويًا. مثال: "الاسطى" تبقى "الاسطى" كما هي.
3) تجاهل أرقام الصفحات والهوامش والعلامات غير الدرامية.
4) كل ظهور لنمط "مشهد + رقم" يعني بداية مشهد جديد داخل scenes.
5) إذا ظهر "قطع" ثم سطر زمن/مكان مثل "نهار - خارجي"، ابدأ مشهدًا جديدًا ولا تدمجه في نفس المشهد السابق.
6) scene_heading يجب أن يحتوي رقم المشهد + الزمن/المكان (مثال: "مشهد 2، نهار - خارجي").
7) أول سطر وصفي قصير بعد عنوان المشهد غالبًا هو location ويجب إبقاؤه كعنصر action مستقل داخل content.
8) قسّم كل مشهد إلى content عناصر من نوعين فقط:
   - action: للوصف السردي أو الحركي.
   - dialogue: للحوار المنطوق.
9) في dialogue:
   - ضع speaker فقط عند وجود متحدث واضح.
   - text يحتوي نص الحوار كما هو.
10) لا تضف أي مفاتيح خارج schema، ولا أي شرح أو markdown.

صيغة الإخراج المطلوبة (JSON فقط):
{
  "script_title": "اختياري",
  "scenes": [
    {
      "scene_number": 1,
      "scene_heading": "مشهد ...",
      "content": [
        { "type": "action", "text": "..." },
        { "type": "dialogue", "speaker": "...", "text": "..." }
      ]
    }
  ]
}
`;

async function runOcrPipeline(retryWithBackupKey: boolean = false) {
    try {
        // تحديد مسار الملف - يرجى تعديل المسار هنا حسب موقع ملفك
        const filePath = process.argv[2] || "./12.pdf";
        const textOutputPath = process.argv[3] || "./script_output.txt";
        const schemaOutputPath = process.argv[4] || "./script_output.json";
        const structuredJsonPath = process.argv[5] || "./script_output_structured.json";
        const base64File = encodeFile(filePath);

        console.log("جاري إرسال الملف للمعالجة...");

        const ocrResponse = await client.ocr.process({
            model: "mistral-ocr-latest",
            document: {
                type: "document_url",
                documentUrl: `data:application/pdf;base64,${base64File}`
            },
            includeImageBase64: true,
            // تمرير المخطط لضبط الهيكل
            documentAnnotationFormat: scriptSchema,
            // تمرير التعليمات الصارمة
            documentAnnotationPrompt: engineeringPrompt
        });

        // طباعة النتيجة النهائية
        // النتيجة ستكون موجودة داخل documentAnnotation في الاستجابة
        // استخراج البيانات المنظمة من الاستجابة
        let structuredData: unknown;
        try {
            structuredData = parseNestedJson(ocrResponse.documentAnnotation);
            
            if (!structuredData) {
                throw new Error("لم يتم العثور على بيانات منظمة في استجابة OCR");
            }
            
            if (typeof structuredData === 'string') {
                structuredData = parseNestedJson(structuredData);
            }
        } catch (extractError) {
            console.error("❌ خطأ أثناء استخراج البيانات المنظمة:", (extractError as Error).message);
            // استخدام البيانات الخام كاحتياطي
            structuredData = ocrResponse;
        }
        
        console.log("✅ تم استخراج البيانات بنجاح!");
        console.log("📋 هيكل البيانات المستخرجة:");
        console.log(JSON.stringify(structuredData, null, 2));

        // حفظ نسخة JSON موحدة بأسماء العناصر القياسية
        const structuredOutput = buildStructuredJsonOutput(structuredData);
        fs.writeFileSync(structuredJsonPath, JSON.stringify(structuredOutput, null, 2), 'utf-8');
        console.log(`✅ تم حفظ البيانات المنظمة الموحدة في ملف ${structuredJsonPath}`);

        // حفظ مخرجات السيكما بصيغة ELEMENT = VALUE
        console.log("🧩 جاري تحويل البيانات إلى صيغة السيكما...");
        const schemaOutput = buildSchemaOutput(structuredData);
        fs.writeFileSync(schemaOutputPath, schemaOutput, 'utf-8');
        console.log(`✅ تم حفظ مخرجات السيكما في ملف ${schemaOutputPath}`);

        // حفظ النتيجة في ملف Text منسق
        console.log("📝 جاري تحويل البيانات إلى نص منسق...");
        const textOutput = buildTextOutput(structuredData);
        fs.writeFileSync(textOutputPath, textOutput, 'utf-8');
        console.log(`✅ تم حفظ النتيجة في ملف ${textOutputPath}`);

    } catch (error: any) {
        // إذا كان خطأ 401 (Unauthorized) ولدينا مفتاح احتياطي ولم نحاول استخدامه بعد
        if (error?.statusCode === 401 && process.env.MISTRAL_API_KEY_BACKUP && !retryWithBackupKey) {
            console.warn("⚠️ المفتاح الأساسي غير صالح، جاري المحاولة بالمفتاح الاحتياطي...");
            
            // تبديل المفتاح في العميل
            const backupClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY_BACKUP });
            Object.assign(client, backupClient);
            
            console.log(`🔑 استخدام المفتاح الاحتياطي: (...${process.env.MISTRAL_API_KEY_BACKUP?.slice(-8)})`);
            
            // إعادة المحاولة
            return runOcrPipeline(true);
        }
        
        console.error("❌ حدث خطأ أثناء تنفيذ العملية:", error?.message || error);
        
        if (error?.statusCode === 401) {
            console.error("\n💡 نصيحة: تأكد من:");
            console.error("   1. صلاحية مفاتيح API في ملف .env");
            console.error("   2. تفعيل المفاتيح (قد تحتاج عدة دقائق بعد الإنشاء)");
            console.error("   3. وجود رصيد كافٍ في حسابك على Mistral");
        }
        
        process.exit(1);
    }
}

// تنفيذ الدالة الرئيسية
runOcrPipeline();
