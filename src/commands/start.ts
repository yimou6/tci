import { Command } from 'commander';
import { getTask, Logger, zipDirectory } from '../utils/index.ts';
import { handleBackup, handleUpload } from '../utils/ftp.ts';
import { Client } from 'ssh2';
import { join, isAbsolute, basename, posix, win32 } from 'path';
import { stat, unlink } from 'fs/promises';

export function startCommand(program: Command) {
  program
    .command('start <task>')
    .description('开始运行一个任务。')
    .action(async (task: string) => {
      if (!task) {
        Logger.error('请指定一个任务名称。');
        return;
      }
      const timeStart = Date.now();
      // 读取任务信息
      const taskInfo = await getTask(task);
      if (taskInfo === null) return;
      const { host, localPath, remotePath, remoteBackupPath } = taskInfo;
      const local = win32.join(process.cwd(), localPath);
      const remote = posix.join(remotePath, '');
      const remoteBackup = remoteBackupPath
        ? posix.join(remoteBackupPath, '')
        : '';

      // 检查本地目录是否存在
      try {
        await stat(local);
        Logger.success(`本地路径检查成功: ${local}`);
      } catch (e) {
        Logger.error(`本地目录 ${local} 不存在，停止运行。`, e);
        return;
      }

      const conn = new Client();
      conn
        .on('ready', async () => {
          Logger.success(`服务器 ${host} 连接成功!`);

          // 检查远程目录是否存在
          try {
            await inspectDirectory(conn, remote);
            Logger.success(`远程路径检查成功: ${local}`);
            if (remoteBackup) {
              await inspectDirectory(conn, remoteBackup);
              Logger.success(`远程备份路径检查成功: ${local}`);
            }
          } catch (e) {
            Logger.error(`远程目录准备失败，停止运行。`, e);
            conn.end();
            return;
          }

          // 是否需要备份
          if (remoteBackup) {
            try {
              await handleBackup(conn, remote, remoteBackup);
              Logger.success('备份成功');
            } catch (e) {
              Logger.error(`备份失败，停止运行。`, e);
              conn.end();
              return;
            }
          }

          // 判断上传文件类型：文件or文件夹
          // 上传文件夹时先压缩成zip,再上传
          const absolute = isAbsolute(local);
          const stats = await stat(
            absolute ? local : join(process.cwd(), local)
          );
          let filePath = local;
          if (!stats.isFile()) {
            // 压缩目录
            filePath = await zipDirectory(local);
          }
          try {
            await handleUpload(
              conn,
              filePath,
              posix.join(remote, basename(filePath))
            );
            Logger.success('上传成功！');
          } catch (e) {
            Logger.error(`上传文件 ${filePath} 失败，停止运行。`, e);
            conn.end();
            return;
          }

          // 删除本地zip文件
          if (!stats.isFile()) {
            try {
              await unlink(filePath);
              Logger.success('删除本地zip文件成功！');
            } catch (e) {
              Logger.error(`删除文件 ${filePath} 失败，请手动删除。`, e);
            }
          }
          const timeEnd = Date.now();
          Logger.info(`耗时：${(timeEnd - timeStart) / 1000}s`);
          conn.end();
          return;
        })
        .on('error', (err) => {
          Logger.error(err);
        })
        .on('end', () => {
          Logger.info('服务关闭。');
        })
        .connect({
          host: taskInfo.host,
          port: 22,
          username: taskInfo.username,
          password: taskInfo.password,
        });
    });
}

/**
 * 检查远程目录是否存在，如果不存在则尝试创建。
 * 只会创建最后一级目录，如果父目录不存在则会失败。
 * @param conn {Client}
 * @param dirPath {string} 目录路径
 * @param mode {number} 目录的权限模式，例如 0o755
 */
async function inspectDirectory(
  conn: Client,
  dirPath: string,
  mode: number = 0o755
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        return reject(err);
      }

      sftp.stat(dirPath, (err, stats) => {
        if (err) {
          Logger.info(`目录 ${dirPath} 不存在，尝试创建...`);
          sftp.mkdir(dirPath, { mode: mode }, (mkdirErr) => {
            if (mkdirErr) {
              return reject(
                new Error(`创建目录 ${dirPath} 失败，请确保父目录存在。`)
              );
            }
            Logger.info(`目录 ${dirPath} 创建成功`);
            resolve(true);
          });
        } else if (stats.isDirectory()) {
          resolve(true);
        } else {
          return reject(new Error(`路径 ${dirPath} 存在但不是一个目录`));
        }
      });
    });
  });
}
