# 智旅 AI 探险家 · SmartTrip AI Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vitejs.dev)
[![GitHub Pages](https://img.shields.io/badge/Deployed-GitHub%20Pages-222.svg)](https://yifenqian1990-wq.github.io/smarttrip-ai-explorer/)

AI 驱动的智能旅游规划应用：输入偏好，一键生成个性化行程、预算估算和本地指南，行程直接在地图上展示。

🌐 **在线体验：https://yifenqian1990-wq.github.io/smarttrip-ai-explorer/**

## ✨ 功能特性

- 🗺️ **智能行程规划**：填写目的地、日期、预算、偏好，AI 生成 day-by-day 行程
- 💰 **预算估算**：交通、住宿、餐饮、门票分项预算
- 📍 **地图展示**：行程点位可视化，支持高德地图（国内）/ OSM（国际）双地图源
- 🤖 **AI 旅行助手**：行程问答、调整建议，流式对话
- 📊 **数据图表**：预算占比等可视化（Recharts）
- 🔑 **多 Key 管理**：API Key 本地管理，一键切换
- 💾 **行程存档**：行程本地保存、导入导出

## 🚀 快速开始（本地运行）

```bash
git clone https://github.com/yifenqian1990-wq/smarttrip-ai-explorer.git
cd smarttrip-ai-explorer
npm install
npm run dev        # http://localhost:3000
```

构建生产包：

```bash
npm run build      # 产物在 dist/，任意静态服务器即可托管
```

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| AI 能力 | @google/genai（行程生成、旅行问答）|
| 地图 | 高德地图 JS API / Leaflet + OSM |
| 图表 | Recharts |
| 数据存储 | 浏览器本地（localStorage）|
| 部署 | GitHub Pages（自动） |

## 📦 部署

本仓库已配置 GitHub Actions，推送到 `main` 分支后自动构建并发布到 GitHub Pages，无需手动操作。

想部署到自己的账号：Fork 本仓库 → Settings → Pages → Source 选择 `GitHub Actions`，推送即生效。

## ❓ FAQ

**Q: 需要 API Key 吗？**
A: AI 行程规划需要。在设置里填入 Gemini API Key，Key 只保存在你的浏览器本地。

**Q: 高德地图 Key 怎么填？**
A: 在设置 → 地图配置里填入你自己的高德 Web 端 Key 和安全密钥（[高德开放平台](https://lbs.amap.com/)免费申请）。不出境的话也可以直接用 OSM，无需 Key。

**Q: 行程数据会上传吗？**
A: 不会。全部存在浏览器本地。

## 📄 许可证

本项目采用 [MIT](LICENSE) 许可证开源。
