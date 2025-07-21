#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { startCommand } from './commands/start.js';

// 定义版本和描述
program
  .version('1.0.0')
  .description('A sample CLI tool built with Node.js and TypeScript');

// 添加命令
startCommand(program);

// 解析命令行参数
program.parse(process.argv);

// 处理无命令情况
if (process.argv.length <= 2) {
  program.outputHelp();
  console.log(chalk.yellow('\nExample: my-cli greet "John Doe"'));
}
