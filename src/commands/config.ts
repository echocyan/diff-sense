import type { Command } from "commander";

/** 注册 config 子命令（占位，待实现） */
export function registerConfigCommand(program: Command) {
  program
    .command("config")
    .description("管理配置")
    .action(() => {
      console.log("config command — not yet implemented");
    });
}
