/** CLI 入口：注册子命令并执行 */
import { Command } from "commander";
import { registerReviewCommand } from "./commands/review";
import { registerConfigCommand } from "./commands/config";
import { getVersion } from "./commands/version";

const program = new Command();

program
  .name("diff-sense")
  .description("轻量级 AI 驱动的代码审查 CLI 工具")
  .version(getVersion(), "-v, --version");

registerReviewCommand(program);
registerConfigCommand(program);

program
  .command("version")
  .description("显示版本号")
  .action(() => {
    console.log(getVersion());
  });

program.parse();
