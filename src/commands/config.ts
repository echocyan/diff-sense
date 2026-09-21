import type { Command } from "commander";

export function registerConfigCommand(program: Command) {
  program
    .command("config")
    .description("管理配置")
    .action(() => {
      console.log("config command — not yet implemented");
    });
}
