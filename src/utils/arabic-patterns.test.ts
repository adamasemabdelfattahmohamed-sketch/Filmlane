import { describe, test, expect } from "vitest";
import {
  FULL_ACTION_VERB_SET,
  DIALECT_PATTERNS,
  NEGATION_PATTERNS,
  NEGATION_PLUS_VERB_RE,
  PRONOUN_ACTION_RE,
  TRANSITION_RE,
  detectDialect,
  ARABIC_NUMBER_RE,
  convertHindiToArabic,
} from "./arabic-patterns";

describe("Extended Regex Patterns", () => {
  test("يجب أن تحتوي مجموعة الأفعال على 250+ فعل", () => {
    expect(FULL_ACTION_VERB_SET.size).toBeGreaterThan(250);
  });

  test("يجب كشف الأفعال الأصلية", () => {
    expect(FULL_ACTION_VERB_SET.has("يدخل")).toBe(true);
    expect(FULL_ACTION_VERB_SET.has("ينظر")).toBe(true);
    expect(FULL_ACTION_VERB_SET.has("يجلس")).toBe(true);
  });

  test("يجب كشف الأفعال الإضافية", () => {
    expect(FULL_ACTION_VERB_SET.has("استدار")).toBe(true);
    expect(FULL_ACTION_VERB_SET.has("ابتسم")).toBe(true);
    expect(FULL_ACTION_VERB_SET.has("تجهم")).toBe(true);
    expect(FULL_ACTION_VERB_SET.has("ترنح")).toBe(true);
    expect(FULL_ACTION_VERB_SET.has("اندفع")).toBe(true);
  });

  test("يجب كشف اللهجة المصرية", () => {
    expect(DIALECT_PATTERNS.egyptian.test("قال إيه ده")).toBe(true);
    expect(DIALECT_PATTERNS.egyptian.test("عايز أروح")).toBe(true);
    expect(DIALECT_PATTERNS.egyptian.test("مرحباً")).toBe(false);
  });

  test("يجب كشف اللهجة الشامية", () => {
    expect(DIALECT_PATTERNS.levantine.test("بدي أروح")).toBe(true);
    expect(DIALECT_PATTERNS.levantine.test("هلق بدنا نطلع")).toBe(true);
  });

  test("يجب كشف اللهجة الخليجية", () => {
    expect(DIALECT_PATTERNS.gulf.test("يبي يسوي")).toBe(true);
    expect(DIALECT_PATTERNS.gulf.test("شلون صار")).toBe(true);
  });

  test("detectDialect يجب أن يرجع اللهجة الصحيحة", () => {
    expect(detectDialect("عايز أروح البيت")).toBe("egyptian");
    expect(detectDialect("بدي أروح")).toBe("levantine");
    expect(detectDialect("ابي أسوي")).toBe("gulf");
    expect(detectDialect("يدخل الغرفة")).toBeNull();
  });

  test("يجب كشف الجمل المنفية", () => {
    expect(NEGATION_PATTERNS.test("لا أعلم")).toBe(true);
    expect(NEGATION_PATTERNS.test("لم يفعل")).toBe(true);
    expect(NEGATION_PATTERNS.test("مش عارف")).toBe(true);
    expect(NEGATION_PATTERNS.test("أحمد")).toBe(false);
  });

  test("يجب كشف الأرقام العربية (الهندية)", () => {
    expect(ARABIC_NUMBER_RE.test("٤٢")).toBe(true);
    expect(ARABIC_NUMBER_RE.test("abc")).toBe(false);
  });

  test("يجب تحويل الأرقام الهندية", () => {
    expect(convertHindiToArabic("مشهد ١٢")).toBe("مشهد 12");
  });

  test("PRONOUN_ACTION_RE لا يجب أن يطابق كلمة مثل الاسطى", () => {
    expect(PRONOUN_ACTION_RE.test("الاسطى")).toBe(false);
  });

  test("PRONOUN_ACTION_RE يجب أن يطابق تركيب أكشن صحيح", () => {
    expect(PRONOUN_ACTION_RE.test("وهو مازال يتوضأ")).toBe(true);
  });

  test("NEGATION_PLUS_VERB_RE يجب أن يطابق النفي السردي (ثالث شخص)", () => {
    expect(NEGATION_PLUS_VERB_RE.test("لا يتحرك")).toBe(true);
  });

  test("NEGATION_PLUS_VERB_RE لا يجب أن يطابق نفي المتكلم/المخاطب", () => {
    expect(NEGATION_PLUS_VERB_RE.test("لا أعرف")).toBe(false);
    expect(NEGATION_PLUS_VERB_RE.test("لا اعرف")).toBe(false);
    expect(NEGATION_PLUS_VERB_RE.test("لا تتحرك")).toBe(false);
  });

  test("TRANSITION_RE يجب أن يطابق سطر الانتقال المستقل فقط", () => {
    expect(TRANSITION_RE.test("قطع")).toBe(true);
    expect(TRANSITION_RE.test("قطع إلى:")).toBe(true);
    expect(TRANSITION_RE.test("قطع الطريق إلى المنزل")).toBe(false);
  });
});
