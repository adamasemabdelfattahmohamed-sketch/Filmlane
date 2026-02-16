import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, extname, join } from "path";

const PDF_CONVERTER_TIMEOUT_MS = 180_000;
const PDF_CONVERTER_MAX_BUFFER = 64 * 1024 * 1024;

type ExecFileError = Error & {
  stdout?: Buffer | string;
  stderr?: Buffer | string;
};

export type PdfConverterFlowRunResult = {
  text: string;
  warnings: string[];
  attempts: string[];
  textOutputPath: string;
};

const decodeUtf8Buffer = (value: Buffer | string | null | undefined): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return new TextDecoder("utf-8").decode(value);
};

const resolveTempPdfFilename = (filename: string): string => {
  const base = basename(filename || "document.pdf");
  const hasPdfExt = extname(base).toLowerCase() === ".pdf";
  return hasPdfExt ? base : `${base}.pdf`;
};

const runPdfFlowScript = async (
  scriptPath: string,
  inputPdfPath: string,
  textOutputPath: string,
  schemaOutputPath: string,
  structuredOutputPath: string
): Promise<{ stdout: Buffer; stderr: Buffer }> => {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        scriptPath,
        inputPdfPath,
        textOutputPath,
        schemaOutputPath,
        structuredOutputPath,
      ],
      {
        encoding: "buffer",
        timeout: PDF_CONVERTER_TIMEOUT_MS,
        maxBuffer: PDF_CONVERTER_MAX_BUFFER,
        windowsHide: true,
        env: {
          ...process.env,
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

export async function runPdfConverterFlow(
  buffer: Buffer,
  filename: string
): Promise<PdfConverterFlowRunResult> {
  const warnings: string[] = [];
  const attempts = ["pdf-converter-flow"];
  const scriptPath = join(process.cwd(), "src", "utils", "pdf-converter-flow.ts");
  const startedAt = Date.now();

  if (!existsSync(scriptPath)) {
    throw new Error(`ملف pdf-converter-flow غير موجود: ${scriptPath}`);
  }

  let tempDirPath: string | null = null;
  try {
    tempDirPath = await mkdtemp(join(tmpdir(), "pdf-converter-flow-runner-"));
    const inputPdfPath = join(tempDirPath, resolveTempPdfFilename(filename));
    const textOutputPath = join(tempDirPath, "script_output.txt");
    const schemaOutputPath = join(tempDirPath, "script_output.json");
    const structuredOutputPath = join(tempDirPath, "script_output_structured.json");

    await writeFile(inputPdfPath, buffer);
    const { stdout, stderr } = await runPdfFlowScript(
      scriptPath,
      inputPdfPath,
      textOutputPath,
      schemaOutputPath,
      structuredOutputPath
    );

    const stdoutText = decodeUtf8Buffer(stdout).trim();
    const stderrText = decodeUtf8Buffer(stderr).trim();
    if (stdoutText) warnings.push(stdoutText);
    if (stderrText) warnings.push(stderrText);

    const text = await readFile(textOutputPath, "utf-8");
    if (!text.trim()) {
      throw new Error("pdf-converter-flow أعاد ملف TXT فارغًا");
    }

    // eslint-disable-next-line no-console
    console.info("[pdf-converter-flow-runner] success", {
      scriptPath,
      durationMs: Date.now() - startedAt,
      textLength: text.length,
      textOutputPath,
    });

    return {
      text,
      warnings,
      attempts,
      textOutputPath,
    };
  } catch (error) {
    const err = error as ExecFileError;
    const stderrText = decodeUtf8Buffer(err?.stderr).trim();
    if (stderrText) warnings.push(stderrText);

    // eslint-disable-next-line no-console
    console.error("[pdf-converter-flow-runner] failed", {
      scriptPath,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(error),
    });

    throw new Error("فشل تحويل ملف PDF عبر pdf-converter-flow", {
      cause: error,
    });
  } finally {
    if (tempDirPath) {
      await rm(tempDirPath, { recursive: true, force: true }).catch(() => {
        // best effort cleanup
      });
    }
  }
}
