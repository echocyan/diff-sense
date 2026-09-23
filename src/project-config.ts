import { join } from "node:path";
import { z } from "zod";
import type { Rule } from "./types";
import { readJsonConfig } from "./json-config";

// 项目配置文件相对仓库根目录的路径
const CONFIG_PATH = ".diff-sense/rules.json";

// 严格模式：未支持的字段（如 include）直接报错，避免用户误以为已生效
const ProjectConfigSchema = z.strictObject({
  exclude: z.array(z.string()).default([]),
  rules: z.array(z.strictObject({ pattern: z.string(), rule: z.string() })).default([]),
});

/** 项目级配置 `.diff-sense/rules.json` */
export interface ProjectConfig {
  /** 额外的文件排除模式 */
  exclude: string[];
  /** 项目规则，优先于内置规则匹配 */
  rules: Rule[];
}

/** 读取项目配置，文件不存在时返回空配置；JSON 或结构无效时抛错 */
export async function loadProjectConfig(cwd: string): Promise<ProjectConfig> {
  return readJsonConfig(join(cwd, CONFIG_PATH), ProjectConfigSchema, CONFIG_PATH);
}
