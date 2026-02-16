// @vitest-environment node

import { readdirSync } from "fs";
import { tmpdir } from "os";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("child_process", () => {
  const mockModule = {
    execFile: execFileMock,
  };
  return {
    ...mockModule,
    default: mockModule,
  };
});

import { convertDocBufferToText } from "./doc-converter-flow";

const listDocConverterTempDirs = (): string[] =>
  readdirSync(tmpdir()).filter((entry) =>
    entry.startsWith("doc-converter-flow-")
  );

describe("convertDocBufferToText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: Buffer, stderr: Buffer) => void
      ) => {
        callback(
          null,
          Buffer.from("نص\u0001  عربي\n\n\nسطر", "utf-8"),
          Buffer.from("warning from antiword", "utf-8")
        );
      }
    );
  });

  it("invokes antiword with UTF-8 map and no wrapping", async () => {
    const result = await convertDocBufferToText(
      Buffer.from("doc"),
      "sample.doc"
    );

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const args = execFileMock.mock.calls[0]?.[1] as string[];
    expect(args).toContain("-m");
    expect(args).toContain("UTF-8.txt");
    expect(args).toContain("-w");
    expect(args).toContain("0");
    expect(result.method).toBe("doc-converter-flow");
    expect(result.text).toBe("نص عربي\n\nسطر");
    expect(result.warnings[0]).toContain("warning from antiword");
  });

  it("cleans up temp folder after success", async () => {
    const before = listDocConverterTempDirs();
    await convertDocBufferToText(Buffer.from("doc"), "cleanup.doc");
    const after = listDocConverterTempDirs();

    expect(after).toEqual(before);
  });

  it("cleans up temp folder and throws explicit error on failure", async () => {
    execFileMock.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: Buffer, stderr: Buffer) => void
      ) => {
        callback(
          new Error("antiword crashed"),
          Buffer.alloc(0),
          Buffer.from("antiword stderr", "utf-8")
        );
      }
    );

    const before = listDocConverterTempDirs();
    await expect(
      convertDocBufferToText(Buffer.from("doc"), "broken.doc")
    ).rejects.toThrow("فشل تحويل ملف .doc عبر doc-converter-flow");
    const after = listDocConverterTempDirs();

    expect(after).toEqual(before);
  });
});
