# 数智清道夫 · 北京赛区演示站

一个网址包含三个端口，通过同一房间码联动：

- `dashboard.html?session=ICAN2026`：电脑指挥大屏（沿用原智慧城管大屏）
- `detector.html?session=ICAN2026`：手机边缘识别端（沿用原识别网页）
- `?view=worker&session=ICAN2026`：清洁工作业端

完整流程：待命 → 发现事件 → AI 研判 → 已派单 → 处理中 → 已完成。

电脑端地图固定为北京市朝阳区，演示事件锚定北京工业大学，清洁工端按同一现场亚米级点位展示。事件池保留约 10 条前一天至一周内的静态历史记录，只有手机发出的本轮现场事件会新增。三端只传递流程状态，不上传识别画面、识别内容或定位数据；电脑事件侧栏和清洁工作业端均不显示现场照片。

## 本地运行

```powershell
npm install
npm run dev
```

默认地址为 `http://localhost:5173/shuzhi-qingdaofu/`。

## 跨设备同步

项目未配置云端时使用浏览器本机联调，可在同一浏览器的多个标签页中完整测试。比赛现场三台设备使用各自移动数据即可，无需连接同一热点；跨设备联动使用腾讯云 CloudBase：

1. 在腾讯云 CloudBase 创建环境，并记下环境 ID。
2. 在“身份认证 / 登录设置”中启用匿名登录。
3. 创建云数据库集合 `demo_sessions`。
4. 为比赛演示配置“已登录用户可读写”的安全规则；可参考 `cloudbase.rules.example.json`。
5. 在 Web 安全域名中加入 `cheshirechen.github.io`。
6. 环境 ID `ican2026-d6ghzjuxqc7487fde` 已写入默认配置；如以后更换环境，可在 GitHub 仓库 `Settings → Secrets and variables → Actions` 中新建 `CLOUDBASE_ENV_ID` 覆盖它。只有控制台明确提供 Web 可发布密钥时，才需要再配置 `CLOUDBASE_PUBLISHABLE_KEY`。
7. 在 Actions 中重新运行 Pages 工作流。三端后台连接同一房间后即可跨设备同步；不需要再修改源码。

SDK 已作为项目依赖写入代码，无需在电脑或手机上另行下载。只同步 `stage`、房间码和时间戳等状态信号；不上传相机画面、识别类别、置信度、图片或定位内容。

每轮事件只允许识别端发送一次。完成后在电脑端按 `R` 重置，三端回到待命后再开始下一轮。页面刷新会读取 CloudBase 中同一房间的现有状态，不等于重置；手机网络切换或页面从后台恢复时会自动重连并补发尚未送达的状态信号。

## GitHub Pages

项目已包含 GitHub Pages 自动发布流程，推送到 `main` 后会自动构建。

```text
https://cheshirechen.github.io/shuzhi-qingdaofu/
```

## 检查命令

```powershell
npm test
npm run build
```

现场操作顺序见 [DEMO-RUNBOOK.md](./DEMO-RUNBOOK.md)。
