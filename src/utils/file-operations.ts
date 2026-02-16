import { downloadFile } from "./exporters";

export interface ScreenplayData {
  content: string;
  metadata: {
    title: string;
    author: string;
    date: string;
    version: string;
  };
}

/**
 * Save screenplay data as JSON file
 * Thin wrapper around downloadFile for JSON flow
 */
export const saveScreenplay = (
  data: ScreenplayData,
  filename: string = "screenplay.json"
) => {
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, filename, "application/json");
};

/**
 * Load screenplay data from JSON file
 * Opens file picker and returns parsed JSON
 */
export const loadScreenplay = (): Promise<ScreenplayData | null> => {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          resolve(data);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("فشل تحميل الملف:", error);
          resolve(null);
        }
      };
      reader.readAsText(file);
    };

    input.click();
  });
};

/**
 * Open a text file using file picker
 * @param accept - Comma-separated list of accepted MIME types or file extensions
 * @returns Promise resolving to file content or null
 */
export const openTextFile = (
  accept: string = ".txt,.fountain,.fdx"
): Promise<string | null> => {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        resolve(text);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("فشل قراءة الملف:", error);
        resolve(null);
      }
    };

    input.click();
  });
};

/**
 * Open a DOCX file using mammoth and convert to HTML
 * @returns Promise resolving to HTML content or null
 */
export const openDocxFile = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".doc,.docx";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mammoth = (await import("mammoth")) as any;
        const arrayBuffer = await file.arrayBuffer();
        const convert = mammoth.convertToHtml || mammoth.default?.convertToHtml;
        const result = await convert({ arrayBuffer });
        resolve(result.value);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("فشل قراءة ملف DOCX:", error);
        resolve(null);
      }
    };

    input.click();
  });
};

/**
 * Save text content as a file download
 * @param content - The text content to save
 * @param filename - The filename for the download
 * @param mimeType - The MIME type (defaults to text/plain)
 */
export const saveTextFile = (
  content: string,
  filename: string = "document.txt",
  mimeType: string = "text/plain;charset=utf-8"
): void => {
  downloadFile(content, filename, mimeType);
};
