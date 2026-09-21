import { Command } from "commander";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("diff-sense")
  .description("轻量级 AI 驱动的代码审查 CLI 工具")
  .version(pkg.version, "-v, --version");

program
  .command("review")
  .description("审查代码变更")
  .action(() => {
    console.log("review command — not yet implemented");
  });

program
  .command("config")
  .description("管理配置")
  .action(() => {
    console.log("config command — not yet implemented");
  });

program
  .command("version")
  .description("显示版本号")
  .action(() => {
    console.log(pkg.version);
  });

program.parse();
