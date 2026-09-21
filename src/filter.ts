import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { DiffEntry } from "./types";

// git diff 对二进制文件输出的标记前缀
const BINARY_MARKER = "Binary files";

/** 敏感路径模式 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\.env($|\.)/,
  /\.pem$/,
  /\.key$/,
  /\.crt$/,
  /\.cert$/,
  /\.p12$/,
  /\.pfx$/,
  /\.jks$/,
  /\.keystore$/,
  /id_rsa/,
  /id_ed25519/,
  /id_ecdsa/,
  /id_dsa/,
  /credentials\.json$/,
  /secret[s]?\.(json|ya?ml|toml)$/i,
];

/** 代码文件扩展名白名单 */
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
  ".astro",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".scala",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".cs",
  ".swift",
  ".dart",
  ".php",
  ".lua",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".sql",
  ".graphql",
  ".gql",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".htm",
  ".xml",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".mdx",
  ".txt",
  ".dockerfile",
  ".tf",
  ".hcl",
  ".nix",
  ".el",
  ".clj",
  ".cljs",
  ".erl",
  ".ex",
  ".exs",
  ".zig",
  ".r",
  ".R",
  ".jl",
]);

/** 无扩展名但属于代码文件的文件名 */
const CODE_FILENAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Rakefile",
  "Gemfile",
  "Brewfile",
  "Vagrantfile",
  "Procfile",
  "Justfile",
  "Taskfile",
  "CMakeLists.txt",
]);

/** 文件过滤选项 */
export interface FilterOptions {
  /** 用户通过 --exclude 传入的 glob/路径模式 */
  excludePatterns?: string[];
  /** 项目根目录，用于读取 .diff-sense/rules.json */
  cwd?: string;
}

/** 四道门过滤器：删除 → 二进制 → 敏感路径 → 用户排除 → 扩展名白名单 */
export async function filterFiles(
  entries: DiffEntry[],
  options: FilterOptions = {},
): Promise<DiffEntry[]> {
  const configExcludes = options.cwd ? await loadConfigExcludes(options.cwd) : [];
  // 合并 CLI --exclude 和配置文件中的排除模式
  const userPatterns = [...(options.excludePatterns ?? []), ...configExcludes];

  return entries.filter((e) => {
    // 门 0：排除已删除文件
    if (e.status === "deleted") return false;
    // 门 1：排除二进制文件
    if (e.diff.includes(BINARY_MARKER)) return false;
    // 门 2：排除敏感路径
    if (isSensitivePath(e.path)) return false;
    // 门 3：用户排除模式
    if (matchesUserExclude(e.path, userPatterns)) return false;
    // 门 4：扩展名白名单
    if (!isCodeFile(e.path)) return false;
    return true;
  });
}

/** 检查路径是否匹配敏感文件模式（.env、密钥、凭证等） */
function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(path));
}

/** 检查路径是否匹配用户排除模式，支持 glob（*、**）和子字符串匹配 */
function matchesUserExclude(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.includes("*")) {
      // glob 转正则：先用占位符 ⚑ 保护 **，再替换 *，最后还原 **
      // 这样 ** → .* 和 * → [^/]* 不会互相干扰
      const regex = new RegExp(
        "^" +
          pattern
            .replace(/\./g, "\\.")
            .replace(/\*\*/g, "⚑")
            .replace(/\*/g, "[^/]*")
            .replace(/⚑/g, ".*") +
          "$",
      );
      return regex.test(path);
    }
    // 无通配符时退化为子字符串匹配
    return path.includes(pattern);
  });
}

/** 检查文件是否为代码文件（扩展名白名单 + 特殊文件名如 Dockerfile） */
function isCodeFile(path: string): boolean {
  const filename = path.split("/").pop() ?? "";
  if (CODE_FILENAMES.has(filename)) return true;
  const ext = extname(filename).toLowerCase();
  if (!ext) return false;
  return CODE_EXTENSIONS.has(ext);
}

/** 从 .diff-sense/rules.json 读取排除模式，文件不存在时返回空数组 */
async function loadConfigExcludes(cwd: string): Promise<string[]> {
  try {
    const raw = await readFile(`${cwd}/.diff-sense/rules.json`, "utf-8");
    const config = JSON.parse(raw) as { exclude?: string[] };
    return config.exclude ?? [];
  } catch {
    return [];
  }
}

// 导出内部函数供测试
export { isSensitivePath, matchesUserExclude, isCodeFile };
