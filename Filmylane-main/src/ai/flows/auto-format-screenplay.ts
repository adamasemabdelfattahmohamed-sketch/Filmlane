"use server";

/**
 * @fileOverview A screenplay auto-formatting AI agent.
 *
 * - autoFormatScreenplay - A function that formats a raw text into a screenplay.
 * - AutoFormatScreenplayInput - The input type for the autoFormatScreenplay function.
 * - AutoFormatScreenplayOutput - The return type for the autoFormatScreenplay function.
 */

import { ai } from "@/ai/genkit";
import { z } from "genkit";

const AutoFormatScreenplayInputSchema = z.object({
  rawText: z.string().describe("The raw screenplay text to format."),
});
export type AutoFormatScreenplayInput = z.infer<
  typeof AutoFormatScreenplayInputSchema
>;

const AutoFormatScreenplayOutputSchema = z.object({
  formattedScreenplay: z
    .string()
    .describe(
      "The screenplay formatted with proper scene headings, character names, and dialogue."
    ),
});
export type AutoFormatScreenplayOutput = z.infer<
  typeof AutoFormatScreenplayOutputSchema
>;

/**
 * تنسيق السيناريو تلقائياً باستخدام الذكاء الاصطناعي
 *
 * @description
 * يقوم بتنسيق نص سيناريو خام إلى سيناريو منسق بشكل صحيح باستخدام Genkit وGoogle Gemini.
 * يحلل النص ويضيف عناوين المشاهد، أسماء الشخصيات، الحوار، والعناصر الأخرى بالتنسيق الصحيح.
 * يستخدم prompt متخصص لتنسيق السيناريوهات العربية.
 *
 * @param {AutoFormatScreenplayInput} input - المدخلات المطلوبة
 * @param {string} input.rawText - النص الخام للسيناريو المراد تنسيقه
 * @returns {Promise<AutoFormatScreenplayOutput>} السيناريو المنسق
 *
 * @example
 * const result = await autoFormatScreenplay({
 *   rawText: "أحمد يدخل الغرفة ويقول مرحبا"
 * });
 * console.log(result.formattedScreenplay);
 * // "INT. الغرفة - نهار\n\nأحمد\nمرحبا"
 *
 * @throws {Error} إذا فشل الاتصال بـ Google Gemini أو فشل التنسيق
 * @complexity O(n) حيث n طول النص المدخل
 * @sideEffects يستدعي API خارجي (Google Gemini)
 */
export async function autoFormatScreenplay(
  input: AutoFormatScreenplayInput
): Promise<AutoFormatScreenplayOutput> {
  return autoFormatScreenplayFlow(input);
}

const prompt = ai.definePrompt({
  name: "autoFormatScreenplayPrompt",
  input: { schema: AutoFormatScreenplayInputSchema },
  output: { schema: AutoFormatScreenplayOutputSchema },
  prompt: `You are an expert screenplay formatter. Your job is to take raw text and turn it into a properly formatted screenplay.

Consider the following screenplay elements when formatting:

- Scene Headings: Indicate the location and time of day (e.g., INT. COFFEE SHOP - DAY).
- Character Names: Written in ALL CAPS, centered above the dialogue.
- Dialogue: The lines spoken by a character.
- Action: Descriptive scenes and actions, written in a standard format.
- Parentheticals: Indications of how a character delivers a line (e.g., (softly)).
- Transitions: Direct the change from one scene to another (e.g., CUT TO:, FADE OUT:).

Raw Text: {{{rawText}}}`,
});

const autoFormatScreenplayFlow = ai.defineFlow(
  {
    name: "autoFormatScreenplayFlow",
    inputSchema: AutoFormatScreenplayInputSchema,
    outputSchema: AutoFormatScreenplayOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
