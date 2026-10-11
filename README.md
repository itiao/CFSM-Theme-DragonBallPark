# CFSM-Theme-DragonBallPark · 龙珠公园

[CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 的第三方主题。
界面与玩法移植自 **Exia Monitor「龙珠公园」**（`https://tz.cmi.im/`）—— 一台服务器 = 一个龙珠角色，
在线越久进化得越高级，首页是一张等距插画上的「公园」。

> ⚠️ **素材许可（动手前先看这条）**
>
> 本主题自带的两类素材**没有可再分发的授权**：
>
> | 素材 | 情况 |
> | --- | --- |
> | `public/models/*.glb`（82 个龙珠角色模型） | 来自 [`fchapoulliep/dragondex3d`](https://github.com/fchapoulliep/dragondex3d)，**该仓库没有 LICENSE**，默认「保留所有权利」 |
> | `public/bg-kame-iso.jpg`（背景插画） | 右下角有作者署名水印，未授权再分发 |
> | 龙珠角色形象本身 | 版权属集英社 / 东映 |
>
> **自己部署、自己看**：实践上没问题。
> **要发布到主题商店或公开仓库**：必须先替换这两类素材 —— 换成自绘/已授权的等距插画与模型即可，
> 代码不用改（替换 `public/roster.json` + `public/models/` + `public/bg-kame-iso.jpg`，或把
> 「素材托管前缀」指向自己的地址）。

---

## 怎么用

不用自己构建，主题跟着你现有的 Workers 后端跑，二选一：

**① 从主题商店切换**

后台 `/admin#/admin` → 主题商店 → 找到 **龙珠公园** → 安装并切换。

**② 填自定义主题 URL**

把下面这行填进后台的「自定义主题 URL」：

```
https://github.com/<你的用户名>/<仓库名>/tree/dist
```

`dist` 是构建产物分支（源码在 `main`）。想锁版本就把 `dist` 换成那一版产物提交的 40 位 SHA。

线上跑的哪一版，看页面源码里的 `<meta name="theme-version" content="DragonBallPark v...">`。

### 更新是手动的

主题不会自动升级。地址填的是 `tree/dist` 的话，Workers 对分支地址有约一小时缓存，过了自然就是新版；
等不及就把地址临时换成新版本的 SHA。地址本来就锁在 SHA 上的，必须手动改。

### 素材体积

角色模型共约 **44 MB**，按需懒加载（只有出现在公园里的角色才会下载对应的 `.glb`），
所以首屏不会一次性拉完。如果嫌仓库太重，可以把 `public/models/`、`public/roster.json`、
`public/bg-kame-iso.jpg` 挪到别处托管，在主题设置里填「素材托管前缀」即可。

---

## 玩法与数据口径

### 角色与进化

- 每台服务器分配一个龙珠角色家族，分配结果存在浏览器本地（`dragon-park.assign.v1`），刷新不会换人
- **14 个「主角」家族优先**（悟空 / 贝吉塔 / 弗利萨 / 悟饭 / 比克 / 特兰克斯 / 布罗利 / 沙鲁 /
  吉连 / 希特 / 比鲁斯 / 悟吉塔 / 贝吉特 / 黑悟空），用完再从其余 36 个家族里挑
- **进化规则**：`阶段 = floor(在线秒数 / (进化天数 × 86400))`，封顶为该家族的形态数 − 1
  - 默认 30 天一阶。孙悟空有 5 个形态 → 0 / 30 / 60 / 90 / 120 天分别是
    基础形态 / 超级赛亚人 / 超级赛亚人3 / 超级赛亚人蓝 / 自在极意功
  - 进化天数可在设置里改
- **站位不是手调的**：直接从背景插画的像素里找草地 / 沙滩（`src/services/park/placement.ts`），
  再把图像坐标反投影到地面。换背景图不用重调参数

### 与目标站的两处差异

| 功能 | 目标站 | 本主题 |
| --- | --- | --- |
| **今日流量** | 后端有当日累计计数器 | CF-Server-Monitor 只存瞬时速率，**没有当日计数器**。这里用速率按采样间隔积分估算，且**只统计页面开着的时段**，因此是**下限估计**，卡片上带 `*` 标记 |
| **信誉分** | 查第三方 `ip.net.coffee` | 改成**自算健康分**（0–100）：`0.6 × 延迟分 + 0.4 × 丢包分`，各线路取均值。完全不依赖外部服务 |

### 严格遵守 CF-Server-Monitor 的消耗铁律

- 只用了白名单里的 6 个接口：`/api/config`、`/api/servers`、`/api/server`、`/api/history/all`、
  `/api/ws`、`/api/theme_options`
- `/api/config`、`/api/servers` 全生命周期**各只查一次**；**没有任何 `setInterval` 轮询**，
  数值刷新全走 WebSocket
- 首页用 `subscribe=all`，详情页只订阅那一台（同一条连接上改订阅，不重连）
- WS 断线按指数退避重连（1、2、4… 秒，30 秒封顶，10 次后停手）
- `visibilitychange` 隐藏即断 WS，切回来先补一次 REST 再重连
- 遵守后端的 `frontend_ws_timeout_minutes`，到点断开并询问用户
- 首页渲染节流到每秒最多一次；数字统一 `tabular-nums`，刷新不跳字
- 管理入口只跳 `/admin#/admin`，主题内没有登录页
- 页脚展示 `Powered by CF-Server-Monitor`

---

## 主题设置

页面右上角的设置入口，改完停手约 1 秒自动保存。

- **登录站长**：改动通过 `POST /api/theme_options` 同步到后端，所有访客共享
- **访客**：改动只留在本机 localStorage

| 设置项 | 说明 |
| --- | --- |
| 外观 | 跟随系统 / 亮 / 暗 |
| 首页形态 | 公园（3D）/ 列表 |
| 进化天数 | 在线每满多少天进化一阶 |
| 野生角色 | 公园里额外摆放的装饰角色数量 |
| 显示价格 / 顶栏健康分 / 降低动态效果 | 开关 |
| 玻璃模糊 | 面板背景模糊半径 |
| 公园背景图 / 素材托管前缀 | 换背景图、把模型挪到别处托管 |

---

## 开发

```bash
npm install
npm run dev         # http://localhost:5173
npm run typecheck   # tsc -b
npm run build       # 产物：index.html + assets/ + models/ + roster.json + 背景图
```

手边没有后端时，用 `http://localhost:5173/?mock=1` 打开内置假数据（20 台节点，含离线与到期状态）。

想连线上后端调试，在仓库根目录建 `.env` 写 `API_BASE=https://你的后端`，
并把 dev 地址加进后端的 `CORS_ALLOWED_ORIGINS`，否则请求会被 CORS 挡掉。

### 截图验收

```bash
# 先起一个静态服务指向 dist
python -m http.server 8099 --directory dist
# 再用 CDP 截图（不用 chrome --screenshot：3D 的 rAF 会让虚拟时间永远推进不完，命令会挂死）
node scripts/shot.mjs "http://127.0.0.1:8099/?mock=1" shot.png 1600 1000 15000
```

### 数据层在这几个文件

改后端适配基本只碰它们：

- `src/services/cfsm/config.ts` — apiBase / WS 地址 / JWT / Turnstile 凭证
- `src/services/cfsm/http.ts` — 请求封装、401/403 处理、多后端并发
- `src/services/cfsm/mappers.ts` — 后端字段 → 展示模型（单位换算都在这）
- `src/services/cfsm/wsClient.ts` — `/api/ws` 订阅、重连、会话上限
- `src/services/cfsm/api.ts` — 6 个接口的调用封装
- `src/services/store.ts` — 节点状态 store（增量合并 + 每秒最多一次提交）

### 公园相关

- `src/services/park/roster.ts` — 角色名录
- `src/services/park/assignment.ts` — 节点 → 角色分配、进化阶段
- `src/services/park/placement.ts` — 从背景图里解算站位
- `src/components/park/ParkScene.tsx` — Three.js 场景

---

## 发布产物

`.github/workflows/build-theme.yml` 在推送时构建并**追加**提交到产物分支：

| 推送到 | 产物分支 | 用途 |
| --- | --- | --- |
| `main` | `dist` | 线上主题地址 |
| `preview` | `dist-preview` | 上线前验收 |

提交信息保留触发本次构建的源码 commit 说明，格式为 `<源码 commit 标题>` + `build: <sha>`，
不使用 force push，产物分支保留历史。

## 致谢

- 原站：**Exia Monitor「龙珠公园」**（`tz.cmi.im`）
- 3D 模型：[`fchapoulliep/dragondex3d`](https://github.com/fchapoulliep/dragondex3d)
- 后端：[CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor)
- 工程约定参考：[CFSM-Theme-LuminaPlus](https://github.com/volcano-1025/CFSM-Theme-LuminaPlus)
