# Bangumi Anime Manager

一个本地运行的 Bangumi 动画整理工具。它提供网页界面，可以搜索 Bangumi 动画条目，保存个人评分、观看状态和评论，并自动同步到本地 Excel 文件。

## 功能

- 通过动画名称搜索 Bangumi，支持中文名和日文原名
- 查看动画基础信息、制作公司、导演、Bangumi 标签、角色和声优
- 保存观看状态、个人评分和个人评论
- 自动计算个人评分与 Bangumi 评分的差值
- 按标题、标签、公司、年份和观看状态筛选动画列表
- 标签统计点击筛选
- 个人评分分布折线图
- 自动同步 `outputs/anime.xlsx`
- 支持浅色模式和深色模式，默认浅色
- Windows 启动工具可检查环境、启动、停止和打开网页

## 运行要求

- Node.js 20 或更新版本
- 能访问 Bangumi API 的网络环境

当前项目不依赖 npm 第三方包，只需要 Node.js。

## 启动方式

Windows 用户可以双击：

```text
启动工具.cmd
```

或：

```text
BangumiManager.cmd
```

也可以在项目目录运行：

```powershell
npm.cmd start
```

启动后打开：

```text
http://localhost:3000
```

## 数据文件

本地数据保存在：

```text
data/anime.json
```

Excel 文件保存在：

```text
outputs/anime.xlsx
```

`data/anime.json` 是主要数据源，`outputs/anime.xlsx` 是同步导出的表格。建议优先备份 `data/anime.json`。

## 在其他电脑上使用

另一台电脑需要先安装 Node.js 20 或更新版本。

拷贝整个项目文件夹是最简单的方式。至少需要保留以下结构：

```text
BangumiAnimeManager/
  package.json
  server.js
  README.md
  启动工具.cmd
  BangumiManager.cmd
  public/
    index.html
    app.js
    styles.css
  tools/
    launcher.cmd
    launcher.ps1
  data/
    anime.json
  outputs/
    anime.xlsx
```

如果只是迁移已有数据，最重要的是：

```text
data/anime.json
outputs/anime.xlsx
```

其中 `outputs/anime.xlsx` 可以由程序根据 `data/anime.json` 重新生成。

## Excel 字段

Excel 默认包含：

```text
中文Title | 原名Title | 放送年 | 制作公司 | 导演 | bangumi标签 | bangumi评分 | 个人评分 | 评分差 | 个人评论
```

同时包含辅助字段：

```text
Bangumi ID | 放送季度 | 观看状态 | 重要角色及其配音
```

## 开发说明

项目使用 Node.js 内置 HTTP 服务，不依赖 Express 或前端框架。页面代码位于 `public/`，服务端代码位于 `server.js`。

常用命令：

```powershell
npm.cmd start
node --check server.js
node --check public\app.js
```
