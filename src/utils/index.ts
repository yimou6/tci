import { parse } from 'yaml';
import { readFile, stat, readdir, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import chalk from 'chalk';
import type { Task } from '../types.ts';
import JSZip from 'jszip';

/**
 * 日志打印
 */
export class Logger {
  static error(...args: unknown[]) {
    console.log('🐛', chalk.bgRed(...args));
  }
  static success(...args: unknown[]) {
    console.log('👌', chalk.green(...args));
  }
  static info(...args: unknown[]) {
    console.log('🍉', ...args);
  }
}

/**
 * 读取 tci-task.yaml 文件,通过任务名称获取任务配置
 * @param task 任务名称
 */
export async function getTask(task: string): Promise<Task | null> {
  try {
    // 配置文件路径
    const taskYamlPath = join(process.cwd(), 'tci-task.yaml');

    try {
      // 检查配置文件是否存在
      const stats = await stat(taskYamlPath);
      if (stats.isFile()) {
        Logger.success('配置文件检查成功: ', taskYamlPath);
      } else {
        Logger.error(`配置文件检查失败,${taskYamlPath}不是一个文件`);
        return null;
      }
    } catch (e) {
      Logger.error('配置文件不存在', e);
      return null;
    }

    try {
      // 读取配置文件
      const taskYaml = await readFile(taskYamlPath, 'utf-8');
      const config = parse(taskYaml);
      if (config[task]) {
        Logger.success(`任务[${task}]配置读取成功`);
      }
      const valid = await validateTask(config[task]);
      if (valid) {
        return config[task];
      }

      Logger.error(`未读取到任务[${task}]的配置`);
      return null;
    } catch (e) {
      Logger.error('读取配置文件读取失败!', e);
      return null;
    }
  } catch (e) {
    Logger.error(e);
    return null;
  }
}

/**
 * 校验任务配置
 * @param taskInfo {Task} 任务配置
 * 1、host 必填校验,IP地址格式校验
 * 2、username 必填校验,3~16位字符校验
 * 3、password 必填校验,3~20位字符校验
 * 4、localPath 必填校验,路径格式校验，路径是否存在校验
 * 5、remotePath 必填校验,路径格式校验
 */
export async function validateTask(taskInfo: Task): Promise<boolean> {
  const { host, username, password, localPath, remotePath } = taskInfo;

  // 1. host validation
  if (!host) {
    Logger.error('host is required.');
    return false;
  }
  const ipRegex =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(host)) {
    Logger.error('host 格式不正确.');
    return false;
  }

  // 2. username validation
  if (!username || username.length < 3 || username.length > 16) {
    Logger.error('username 不能为空且长度为3-16.');
    return false;
  }

  // 3. password validation
  if (!password || password.length < 3 || password.length > 20) {
    Logger.error('password 不能为空且长度为3-20.');
    return false;
  }

  // 4. localPath validation
  if (!localPath) {
    Logger.error('localPath 不能为空.');
    return false;
  }
  try {
    await stat(localPath);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    Logger.error(`localPath 路径不存在: ${localPath}`);
    return false;
  }

  // 5. remotePath validation
  if (!remotePath) {
    Logger.error('remotePath 不能为空.');
    return false;
  }

  Logger.success('任务配置校验成功!');
  return true;
}

let fileTotal = 0;
/**
 * 使用jszip压缩文件夹中的文件，并将压缩后的文件保存到当前运行目录
 * @param directoryPath {string} 文件夹路径
 * @returns {Promise<string>} 返回生成的zip文件路径
 */
export async function zipDirectory(directoryPath: string): Promise<string> {
  try {
    // 创建一个新的JSZip实例
    const zip = new JSZip();

    // 检查目录是否存在
    try {
      const stats = await stat(directoryPath);
      if (!stats.isDirectory()) {
        throw new Error(`${directoryPath} 不是一个有效的目录`);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      throw new Error(`目录不存在或无法访问: ${directoryPath}`);
    }

    fileTotal = 0;
    Logger.info(`正在压缩 ${directoryPath}`);
    // 递归添加文件到zip
    await addFilesToZip(zip, directoryPath, '');

    // 生成zip文件
    Logger.info(`正在生成zip文件...`);
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9, // 最高压缩级别
      },
    });

    // 生成zip文件名
    const dirName = basename(directoryPath);
    const timestamp =
      new Date().toLocaleDateString().replace(/\//g, '') +
      '_' +
      new Date().toLocaleTimeString().replace(/:/g, '');
    const zipFileName = `${dirName}_${timestamp}.zip`;
    const zipFilePath = join(process.cwd(), zipFileName);

    // 写入文件
    await writeFile(zipFilePath, zipBuffer);

    Logger.success(`压缩完成!`);
    Logger.success(`共压缩${fileTotal}个文件`);
    Logger.success(
      `文件已保存到: ${zipFilePath}，大小: ${zipBuffer.length} 字节`
    );
    return zipFilePath;
  } catch (error) {
    Logger.error(
      `压缩目录失败: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * 递归地将目录中的文件添加到zip对象中
 * @param zip {JSZip} JSZip实例
 * @param basePath {string} 基础目录路径
 * @param relativePath {string} 相对路径
 */
async function addFilesToZip(
  zip: JSZip,
  basePath: string,
  relativePath: string
): Promise<void> {
  try {
    const currentPath = join(basePath, relativePath);
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = join(relativePath, entry.name);
      const entryFullPath = join(basePath, entryRelativePath);

      if (entry.isDirectory()) {
        // 如果是目录，递归处理
        await addFilesToZip(zip, basePath, entryRelativePath);
      } else if (entry.isFile()) {
        // 如果是文件，添加到zip
        try {
          const fileContent = await readFile(entryFullPath);
          // 使用相对路径作为zip中的路径，确保路径分隔符统一
          const zipPath = entryRelativePath.split(/[\\/]/).join('/');
          zip.file(zipPath, fileContent);
          fileTotal++;
        } catch (error) {
          Logger.error(
            `无法读取文件 ${entryFullPath}: ${error instanceof Error ? error.message : String(error)}`
          );
          // 继续处理其他文件，不中断整个过程
        }
      }
      // 忽略符号链接和其他特殊文件类型
    }
  } catch (error) {
    throw new Error(
      `处理目录 ${join(basePath, relativePath)} 失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * 生成时间戳
 *
 */
export function generateTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now
    .getHours()
    .toString()
    .padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now
    .getSeconds()
    .toString()
    .padStart(2, '0')}`;
}

export async function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
