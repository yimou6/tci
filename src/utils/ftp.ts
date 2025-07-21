import { Client } from 'ssh2';
import path from 'path';
import fs from 'fs';
import { generateTimestamp, sleep } from './index.ts';

/**
 * 处理文件上传,依赖本地 fs 判断，远程需安装 unzip 命令。
 * @param conn {Client}
 * @param local {string} 本地文件路径
 * @param remote {string} 远程文件路径
 * 1、判断local是否为文件，为文件则上传，为目录停止上传。(只上传文件)
 * 2、如果local文件为zip文件，则上传zip文件之后在remote目录下解压，解压完成之后删除zip文件。
 * 3、非zip文件正常上传
 */
export async function handleUpload(
  conn: Client,
  local: string,
  remote: string
): Promise<void> {
  // 1. 判断 local 是否为文件
  if (!fs.existsSync(local) || !fs.statSync(local).isFile()) {
    throw new Error('Local path must be a file.');
  }

  // 2. 上传文件
  const sftp = await new Promise<import('ssh2').SFTPWrapper>(
    (resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    }
  );

  const uploadFile = () =>
    new Promise<void>((resolve, reject) => {
      sftp.fastPut(local, remote, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

  await uploadFile();
  await sleep(200);

  // 3. 判断 zip，解压并删除
  const isZip = path.extname(local).toLowerCase() === '.zip';
  if (isZip) {
    // remote 可能为目录或文件路径，取目录部分
    const remoteDir = path.posix.dirname(remote);

    // 解压 zip 并删除
    const unzipCmd = `
      cd "${remoteDir}" && \
      unzip -o "${remote}" && \
      rm -f "${remote}"`.replace(/\n/g, ' ');

    await new Promise<void>((resolve, reject) => {
      conn.exec(unzipCmd, (err, stream) => {
        if (err) return reject(err);
        let stderr = '';
        stream.stderr.on('data', (data) => {
          stderr += data;
        });
        stream.on('exit', (code: number) => {
          if (code === 0) resolve();
          else reject(new Error(`Unzip failed: ${stderr}`));
        });
      });
    });
  }
}
/**
 * 处理备份,远程需安装 zip 命令。
 * @param conn {Client}
 * @param remote {string} 源路径
 * @param backup {string} 备份路径
 * @example
 * handleBackup(conn, '/home/tci/tci-task.yaml', '/home/tci/backup')
 * => 生成的备份文件：/home/tci/backup/tci-task_202507211008.yaml
 * handleBackup(conn, '/home/tci/dist', '/home/tci/backup')
 * => 生成的备份文件：/home/tci/backup/dist_202507211008.zip
 */
export async function handleBackup(
  conn: Client,
  remote: string,
  backup: string
): Promise<string> {
  // 判断文件还是目录
  const stat = async (): Promise<'file' | 'dir'> => {
    return new Promise((resolve, reject) => {
      conn.exec(
        `if [ -d "${remote}" ]; then echo dir; elif [ -f "${remote}" ]; then echo file; fi`,
        (err, stream) => {
          if (err) return reject(err);
          let data = '';
          stream.on('data', (chunk: unknown) => (data += chunk));
          stream.on('close', () => {
            if (data.trim() === 'dir') resolve('dir');
            else if (data.trim() === 'file') resolve('file');
            else reject(new Error('Remote path not found or invalid'));
          });
        }
      );
    });
  };

  // 文件名生成
  const genBackupName = (base: string, ext: string) => {
    return `${base}_${generateTimestamp()}.${ext}`;
  };

  // 执行备份
  const doBackup = async (type: 'file' | 'dir'): Promise<string> => {
    const baseName = path.basename(
      remote,
      type === 'dir' ? '' : path.extname(remote)
    );
    let backupFile: string;
    let cmd: string;

    if (type === 'file') {
      const ext = path.extname(remote).replace(/^\./, '') || 'bak';
      backupFile = path.posix.join(backup, genBackupName(baseName, ext));
      cmd = `cp "${remote}" "${backupFile}"`;
    } else {
      backupFile = path.posix.join(backup, genBackupName(baseName, 'zip'));
      cmd = `zip -r "${backupFile}" "${remote}"`;
    }

    return new Promise((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let errorMsg = '';
        stream.on('data', () => {});
        stream.stderr.on('data', (data) => (errorMsg += data));
        stream.on('close', (code: number) => {
          if (code === 0) resolve(backupFile);
          else reject(new Error(`Backup failed: ${errorMsg}`));
        });
      });
    });
  };

  const type = await stat();
  return await doBackup(type);
}
