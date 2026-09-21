import { Command } from "commander";
import { createRequire } from "node:module";
import { registerReviewCommand } from "./commands/review";
import { registerConfigCommand } from "./commands/config";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("diff-sense")
  .description("轻量级 AI 驱动的代码审查 CLI 工具")
  .version(pkg.version, "-v, --version");

registerReviewCommand(program);
registerConfigCommand(program);

program
  .command("version")
  .description("显示版本号")
  .action(() => {
    console.log(pkg.version);
  });

program.parse();
