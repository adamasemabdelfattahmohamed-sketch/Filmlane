"use server";

/**
 * @fileOverview Scene idea generation flow for screenwriters.
 *
 * - generateSceneIdeas - A function that generates scene ideas based on a theme or summary.
 * - GenerateSceneIdeasInput - The input type for the generateSceneIdeas function.
 * - GenerateSceneIdeasOutput - The return type for the generateSceneIdeas function.
 */

import { ai } from "@/ai/genkit";
import { z } from "genkit";

const GenerateSceneIdeasInputSchema = z.object({
  theme: z
    .string()
    .describe("The theme or short summary to base scene ideas on."),
});
export type GenerateSceneIdeasInput = z.infer<
  typeof GenerateSceneIdeasInputSchema
>;

const GenerateSceneIdeasOutputSchema = z.object({
  sceneIdeas: z.array(z.string()).describe("An array of scene ideas."),
  progress: z
    .string()
    .describe("A one-sentence summary of what was generated."),
});
export type GenerateSceneIdeasOutput = z.infer<
  typeof GenerateSceneIdeasOutputSchema
>;

/**
 * توليد أفكار مشاهد بناءً على موضوع أو ملخص
 *
 * @description
 * يقوم بتوليد 3 أفكار لمشاهد سينمائية بناءً على موضوع أو ملخص محدد باستخدام Google Gemini.
 * يركز على الأفكار الإبداعية والمتناسقة مع روح السيناريو العربي.
 * يعيد قائمة من الأفكار مع ملخص موجز لما تم توليده.
 *
 * @param {GenerateSceneIdeasInput} input - المدخلات المطلوبة
 * @param {string} input.theme - الموضوع أو الملخص القصير لتوليد الأفكار بناءً عليه
 * @returns {Promise<GenerateSceneIdeasOutput>} الأفكار المولدة والملخص
 *
 * @example
 * const result = await generateSceneIdeas({
 *   theme: "قصة حب في القاهرة القديمة"
 * });
 * console.log(result.sceneIdeas); // ["فكرة 1", "فكرة 2", "فكرة 3"]
 * console.log(result.progress); // "تم توليد 3 أفكار مشاهد حول قصة حب في القاهرة"
 *
 * @throws {Error} إذا فشل الاتصال بـ Google Gemini أو فشل التوليد
 * @complexity O(1) عملية توليد ثابتة لـ 3 أفكار
 * @sideEffects يستدعي API خارجي (Google Gemini)
 */
export async function generateSceneIdeas(
  input: GenerateSceneIdeasInput
): Promise<GenerateSceneIdeasOutput> {
  return generateSceneIdeasFlow(input);
}

const prompt = ai.definePrompt({
  name: "generateSceneIdeasPrompt",
  input: { schema: GenerateSceneIdeasInputSchema },
  output: { schema: GenerateSceneIdeasOutputSchema },
  prompt: `You are a creative screenwriter. Generate 3 scene ideas based on the following theme or summary:\n\nTheme/Summary: {{{theme}}}\n\nPresent the scene ideas as a numbered list.\n\nYour output should be in the following JSON format:
{
  "sceneIdeas": ["Scene Idea 1", "Scene Idea 2", "Scene Idea 3"],
  "progress": "A one-sentence summary of what you generated."
}
`,
});

const generateSceneIdeasFlow = ai.defineFlow(
  {
    name: "generateSceneIdeasFlow",
    inputSchema: GenerateSceneIdeasInputSchema,
    outputSchema: GenerateSceneIdeasOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
