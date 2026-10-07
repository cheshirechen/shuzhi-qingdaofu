# 数智清道夫 · 北京赛区演示站

一个网址包含三个端口，通过同一房间码联动：

- `?view=dashboard&session=ICAN2026`：电脑指挥大屏
- `?view=detector&session=ICAN2026`：手机边缘识别端
- `?view=worker&session=ICAN2026`：清洁工作业端

完整流程：待命 → 发现事件 → AI 研判 → 已派单 → 处理中 → 已完成。

## 本地运行

```powershell
npm install
npm run dev
```

默认地址为 `http://localhost:5173/shuzhi-qingdaofu/`。

## 跨设备同步

项目未配置云端时使用“本机联调”，可在同一浏览器的多个标签页中测试。比赛现场三台设备联动需启用 Firebase Realtime Database：

1. 创建 Firebase 项目和 Web 应用。
2. 在 Authentication 中启用“匿名”登录。
3. 创建 Realtime Database。
4. 将 `firebase.rules.json` 内的规则发布到该数据库。
5. 把 Web API Key 和 Database URL 填入 `src/realtime-config.js`。
6. 重新构建发布。页面右上角显示“云端联机”后，三端即可跨设备同步。

只同步 `stage` 、房间码和时间戳等状态信号；不上传相机画面、识别类别、置信度、图片或定位内容。

## GitHub Pages

建议新建仓库 `shuzhi-qingdaofu`，不重命名旧仓库 `codex_practice`，这样旧网址会继续可用。项目已包含 GitHub Pages Actions，构建路径会跟随仓库名。

```text
https://cheshirechen.github.io/shuzhi-qingdaofu/
```

## 检查命令

```powershell
npm test
npm run build
```

现场操作顺序见 [DEMO-RUNBOOK.md](./DEMO-RUNBOOK.md)。
