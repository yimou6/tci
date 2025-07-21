export interface Task {
  host: string; // 远程服务器地址
  username: string; // 登录用户名
  password: string; // 登录密码
  localPath: string; // 本地路径
  remotePath: string; // 远程路径
  remoteBackupPath?: string; // 远程备份路径
  description?: string; // 任务描述
}
