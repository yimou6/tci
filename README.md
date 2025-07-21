# @yimou6/tci

一个将文件或文件夹上传到linux服务器上的命令行工具

## 安装

1、安装`@yimou6/tci`

```bash
npm install -g @yimou6/tci
```

2、创建配置文件`tci-task.yaml`，默认读取运行目录下的`tci-task.yaml`文件

## 使用

### start

启动任务。

读取配置文件`tci-task.yaml`，通过任务名称获取对应的任务配置，并执行上传任务。

单个文件直接上传，多个文件则先压缩成zip包，再上传，上传再后解压缩。

```bash
tci start [任务名称]
```

### 配置文件 tci-task.yaml

```yaml
[taskName]:
  host: 127.0.0.1 # 服务器地址
  username: root # 登录用户名
  password: root # 登录密码
  localPath: ./dist # 本地路径
  remotePath: /usr/test/dist # 远程路径
  remoteBackupPath: /usr/test/dist_backups # 远程备份路径
  description: 更新应用到测试服务器
```

## 开发

### 项目结构
```
yimou6/tci/
├── src/
│   ├── index.ts        # 入口文件
│   ├── commands/       # 命令处理模块
│   │   └── start.ts    # 开始任务命令
│   └── utils/          # 工具函数
├── package.json
└── tsconfig.json
```
