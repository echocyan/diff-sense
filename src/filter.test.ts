import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { filterFiles, isSensitivePath, matchesUserExclude, isCodeFile } from "./filter";
import type { DiffEntry } from "./types";

function entry(overrides: Partial<DiffEntry> = {}): DiffEntry {
  return {
    path: "src/test.ts",
    status: "modified",
    diff: "diff --git ...",
    insertions: 1,
    deletions: 0,
    ...overrides,
  };
}

describe("filterFiles", () => {
  it("保留普通代码文件", async () => {
    const result = await filterFiles([entry()]);
    expect(result).toHaveLength(1);
  });

  it("排除二进制文件", async () => {
    const result = await filterFiles([
      entry({ diff: "Binary files a/img.png and b/img.png differ" }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("排除已删除文件", async () => {
    const result = await filterFiles([entry({ status: "deleted" })]);
    expect(result).toHaveLength(0);
  });

  it("排除敏感路径", async () => {
    const result = await filterFiles([
      entry({ path: ".env" }),
      entry({ path: ".env.local" }),
      entry({ path: "config/secret.pem" }),
      entry({ path: "src/app.ts" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/app.ts");
  });

  it("应用用户排除模式", async () => {
    const result = await filterFiles(
      [entry({ path: "src/app.ts" }), entry({ path: "docs/readme.md" })],
      { excludePatterns: ["docs/**"] },
    );
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/app.ts");
  });

  it("排除非代码文件扩展名", async () => {
    const result = await filterFiles([
      entry({ path: "assets/logo.png" }),
      entry({ path: "data/file.bin" }),
      entry({ path: "src/app.ts" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/app.ts");
  });

  describe("配置文件排除", () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `diff-sense-test-${Date.now()}`);
      await mkdir(join(testDir, ".diff-sense"), { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("读取 .diff-sense/rules.json 中的 exclude 模式", async () => {
      await writeFile(
        join(testDir, ".diff-sense/rules.json"),
        JSON.stringify({ exclude: ["vendor/**"] }),
      );
      const result = await filterFiles(
        [entry({ path: "src/app.ts" }), entry({ path: "vendor/lib.js" })],
        { cwd: testDir },
      );
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/app.ts");
    });

    it("配置文件不存在时不报错", async () => {
      const result = await filterFiles([entry({ path: "src/app.ts" })], {
        cwd: testDir + "/nonexistent",
      });
      expect(result).toHaveLength(1);
    });

    it("配置文件与 CLI --exclude 合并生效", async () => {
      await writeFile(
        join(testDir, ".diff-sense/rules.json"),
        JSON.stringify({ exclude: ["vendor/**"] }),
      );
      const result = await filterFiles(
        [
          entry({ path: "src/app.ts" }),
          entry({ path: "vendor/lib.js" }),
          entry({ path: "docs/readme.md" }),
        ],
        { cwd: testDir, excludePatterns: ["docs/**"] },
      );
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/app.ts");
    });
  });

  it("四道门综合过滤", async () => {
    const entries = [
      entry({ path: "src/app.ts" }), // 通过
      entry({ status: "deleted", path: "src/removed.ts" }), // 门 0
      entry({ diff: "Binary files a/img.png and b/img.png differ", path: "img.png" }), // 门 1
      entry({ path: ".env.production" }), // 门 2
      entry({ path: "src/excluded.ts" }), // 门 3
      entry({ path: "assets/logo.svg" }), // 门 4（svg 不在白名单）
    ];
    const result = await filterFiles(entries, { excludePatterns: ["**/excluded*"] });
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/app.ts");
  });
});

describe("isSensitivePath", () => {
  it.each([
    ".env",
    ".env.local",
    ".env.production",
    "config/server.pem",
    "ssl/cert.key",
    "tls/ca.crt",
    "keys/id_rsa",
    "keys/id_ed25519",
    "credentials.json",
    "config/secret.json",
    "config/secrets.yaml",
  ])("识别敏感路径: %s", (path) => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it.each(["src/app.ts", "package.json", "README.md", ".eslintrc.json", "src/environment.ts"])(
    "放行正常路径: %s",
    (path) => {
      expect(isSensitivePath(path)).toBe(false);
    },
  );
});

describe("matchesUserExclude", () => {
  it("简单子字符串匹配", () => {
    expect(matchesUserExclude("src/generated/types.ts", ["generated"])).toBe(true);
  });

  it("glob ** 模式匹配", () => {
    expect(matchesUserExclude("docs/api/index.md", ["docs/**"])).toBe(true);
  });

  it("glob * 模式匹配", () => {
    expect(matchesUserExclude("test.spec.ts", ["*.spec.ts"])).toBe(true);
    expect(matchesUserExclude("src/test.spec.ts", ["**/*.spec.ts"])).toBe(true);
  });

  it("不匹配返回 false", () => {
    expect(matchesUserExclude("src/app.ts", ["docs/**"])).toBe(false);
  });
});

describe("isCodeFile", () => {
  it.each([
    "src/app.ts",
    "lib/utils.js",
    "main.py",
    "server.go",
    "app.rs",
    "App.java",
    "config.yaml",
    "style.css",
    "template.html",
    "query.sql",
    "Dockerfile",
    "Makefile",
  ])("识别代码文件: %s", (path) => {
    expect(isCodeFile(path)).toBe(true);
  });

  it.each([
    "logo.png",
    "image.jpg",
    "font.woff2",
    "archive.zip",
    "data.bin",
    "video.mp4",
    "icon.ico",
    "doc.pdf",
  ])("排除非代码文件: %s", (path) => {
    expect(isCodeFile(path)).toBe(false);
  });
});
