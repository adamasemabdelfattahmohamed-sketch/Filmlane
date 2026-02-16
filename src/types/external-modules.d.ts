declare module "mammoth" {
  export interface ExtractRawTextResult {
    value: string;
  }

  export function extractRawText(input: {
    path: string;
  }): Promise<ExtractRawTextResult>;
}

declare module "@anthropic-ai/sdk" {
  export namespace Messages {
    export type MessageCreateParamsNonStreaming = Record<string, unknown>;
  }

  export default class Anthropic {
    constructor(options: {
      apiKey: string;
      maxRetries?: number;
      timeout?: number;
    });

    messages: {
      create: (params: Messages.MessageCreateParamsNonStreaming) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>;
    };
  }
}
