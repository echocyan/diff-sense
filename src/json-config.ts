import { readFile } from "node:fs/promises";
import { z } from "zod";

/**
 * 读取并校验 JSON 配置文件
 *
 * 文件不存在时按空对象解析（由 schema 填充默认值）；JSON 或结构无效时以 label 标明出处报错
 */
export async function readJsonConfig<S extends z.ZodType>(
  path: string,
  schema: S,
  label = path,
): Promise<z.output<S>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return schema.parse({});
    throw err;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} 不是合法的 JSON：${(err as Error).message}`);
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new Error(`${label} 格式无效：\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
