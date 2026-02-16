declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export const getDocument: (options: unknown) => {
    promise: Promise<{
      numPages: number;
      getPage: (
        pageNumber: number
      ) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>;
    }>;
    destroy: () => Promise<void>;
  };
}
