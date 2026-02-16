import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, extname, join } from "path";

const DOC_CONVERTER_TIMEOUT_MS = 30_000;
const DOC_CONVERTER_MAX_BUFFER = 64 * 1024 * 1024;

export type DocConverterFlowResult = {
  text: string;
  method: "doc-converter-flow";
  warnings: string[];
  attempts: string[];
};

type ExecFileError = Error & {
  stdout?: Buffer | string;
  stderr?: Buffer | string;
};

const normalizeNewlines = (value: string): string =>
  value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const decodeUtf8Buffer = (value: Buffer | string | null | undefined): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return new TextDecoder("utf-8").decode(value);
};

function cleanExtractedText(text: string): string {
  return normalizeNewlines(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[^\S\r\n]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const runAntiword = async (
  antiwordPath: string,
  args: string[],
  antiwordHome: string
): Promise<{ stdout: Buffer; stderr: Buffer }> => {
  return new Promise((resolve, reject) => {
    execFile(
      antiwordPath,
      args,
      {
        encoding: "buffer",
        timeout: DOC_CONVERTER_TIMEOUT_MS,
        maxBuffer: DOC_CONVERTER_MAX_BUFFER,
        windowsHide: true,
        env: {
          ...process.env,
          ANTIWORDHOME: antiwordHome,
        },
      },
      (error, stdout, stderr) => {
        const stdoutBuffer = Buffer.isBuffer(stdout)
          ? stdout
          : Buffer.from(stdout ?? "", "utf-8");
        const stderrBuffer = Buffer.isBuffer(stderr)
          ? stderr
          : Buffer.from(stderr ?? "", "utf-8");

        if (error) {
          const wrappedError = error as ExecFileError;
          wrappedError.stdout = stdoutBuffer;
          wrappedError.stderr = stderrBuffer;
          reject(wrappedError);
          return;
        }

        resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
      }
    );
  });
};

const resolveTempFilename = (filename: string): string => {
  const base = basename(filename || "document.doc");
  const hasDocExt = extname(base).toLowerCase() === ".doc";
  return hasDocExt ? base : `${base}.doc`;
};

export async function convertDocBufferToText(
  buffer: Buffer,
  filename: string
): Promise<DocConverterFlowResult> {
  const warnings: string[] = [];
  const attempts = ["doc-converter-flow"];
  const antiwordPath = join(
    process.cwd(),
    ".tools",
    "antiword-app",
    "bin",
    "antiword.exe"
  );
  const antiwordHome = join(
    process.cwd(),
    ".tools",
    "antiword-app",
    "Resources"
  );

  let tempDirPath: string | null = null;
  const startedAt = Date.now();

  try {
    if (!existsSync(antiwordPath)) {
      throw new Error(`antiword.exe غير موجود: ${antiwordPath}`);
    }
    if (!existsSync(antiwordHome)) {
      throw new Error(`ANTIWORDHOME غير موجود: ${antiwordHome}`);
    }

    tempDirPath = await mkdtemp(join(tmpdir(), "doc-converter-flow-"));
    const tempFilePath = join(tempDirPath, resolveTempFilename(filename));
    await writeFile(tempFilePath, buffer);

    const args = ["-m", "UTF-8.txt", "-w", "0", tempFilePath];
    const { stdout, stderr } = await runAntiword(
      antiwordPath,
      args,
      antiwordHome
    );

    const stderrText = decodeUtf8Buffer(stderr).trim();
    if (stderrText) {
      warnings.push(stderrText);
    }

    const decodedText = decodeUtf8Buffer(stdout);
    const cleanedText = cleanExtractedText(decodedText);
    if (!cleanedText) {
      throw new Error("antiword أعاد نصًا فارغًا");
    }

    // eslint-disable-next-line no-console
    console.info("[doc-converter-flow] success", {
      antiwordPath,
      durationMs: Date.now() - startedAt,
      textLength: cleanedText.length,
    });

    return {
      text: cleanedText,
      method: "doc-converter-flow",
      warnings,
      attempts,
    };
  } catch (error) {
    const err = error as ExecFileError;
    const stderrText = decodeUtf8Buffer(err?.stderr).trim();
    if (stderrText) {
      warnings.push(stderrText);
    }

    // eslint-disable-next-line no-console
    console.error("[doc-converter-flow] failed", {
      antiwordPath,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(error),
    });

    const failure = new Error("فشل تحويل ملف .doc عبر doc-converter-flow", {
      cause: error,
    });
    throw failure;
  } finally {
    if (tempDirPath) {
      await rm(tempDirPath, { recursive: true, force: true }).catch(() => {
        // best effort cleanup
      });
    }
  }
}
