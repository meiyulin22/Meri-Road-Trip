# Meri 代码库讲解与 AI 阅读导航

> 核对日期：2026-10-01。本文解释当前仓库的目录、分层和每个项目文件的职责，供 AI 定位代码及向用户讲解。路径相对仓库根目录 `C:\Merlin Programe\Meri-Road-Trip`。这是源码导航，不是未来实施计划；业务操作、请求体、状态变化和失败边界详见 [USER_FLOW_CURRENT.md](USER_FLOW_CURRENT.md)。

## 1. 怎么读这份文件

- 开始任务先读根目录 [AGENTS.md](../AGENTS.md)，以及 [PROJECT.md](PROJECT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[CODING_PRINCIPLES.md](CODING_PRINCIPLES.md)。再读本文第 1–5 节建立代码地图。
- 第 6 节是完整文件索引，按任务查找对应模块，再阅读真实源码和相邻测试。不要求每次把所有文件全文放入上下文；引用文档路径也不等于 AI 已经读取了文件内容。
- 修改用户操作、聊天、API 或持久化时，阅读 `USER_FLOW_CURRENT.md` 的对应详细章节；它保留操作与代码映射，不用本文替代。
- 数据库表、字段、关系与迁移的专门目录见 [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)；改 schema/repository/migration 时查阅。
- 核对实现时以实际入口及调用链为准。一个 helper 有导出和测试，不代表页面正在调用它；历史 SQL 也不代表当前数据库表仍存在。
- 文件索引覆盖版本控制内的源码、测试、配置、迁移、文档和资源，每个文件单独列出。不枚举 `.git/`、`node_modules/`、`.next/`、本地环境密钥、日志及生成缓存。`next-env.d.ts` 和 `*.tsbuildinfo` 是本地生成文件，按 `.gitignore` 排除。
- 此文是维护时的源码快照。增删或移动项目文件时同步索引和引用；文档无法代替实际检查 `git status`、diff 和当前源码。

## 2. 根目录与架构层对应关系

### 2.1 根目录

| 目录地址 | 大体职责 | 架构归属 |
| --- | --- | --- |
| `src/` | 应用入口、界面、业务规则、应用用例和外部系统适配 | 运行时代码，包含下述各层 |
| `docs/` | 产品目标、当前架构、开发原则、详细业务流程和代码导航 | 文档，不参与运行 |
| `docs/product/` | 尚未落地的产品方向说明 | 设计资料，不能当作已实现功能 |
| `public/` | 通过网站 URL 直接访问的背景、品牌、角色图片等静态文件 | 展示资源 |
| `assets/` | 设计参考、品牌预览、角色原图和素材处理脚本 | 设计与素材制作，不是业务层 |
| `drizzle/` | 按顺序执行的数据库迁移 SQL 及生成元数据 | 基础设施：数据库演进 |
| `drizzle/meta/` | 迁移 journal 与历史 schema snapshot | Drizzle 工具元数据 |
| `scripts/` | 人工运行的真实提供方/模型验证工具 | 开发工具，不是 Web API |
| 根目录配置文件 | npm、TypeScript、ESLint、Next.js、Drizzle 配置与 AI 入口 | 工程配置及开发约定 |

### 2.2 `src/` 内的分层

| 目录地址 | 职责与常见内容 | 程序员常用层名称 |
| --- | --- | --- |
| `src/app/` | Next.js App Router 页面、layout、manifest、HTTP 路由 | 框架入口层；页面是展示入口，API 是接口/控制器入口 |
| `src/app/api/` | 接收请求、读 cookie、校验输入、调用应用服务、转换 HTTP 响应 | 接口层；部分业务流程编排当前也在 route 中 |
| `src/app/trips/` | Journey 列表、Workspace 页面和删除入口 | 页面层，含服务端读取与客户端操作组件 |
| `src/components/` | React UI 和前端请求/展示模型 | 表现层（presentation layer） |
| `src/components/meri-shell/` | 首页外壳、创建输入、最近旅程 | 首页表现层 |
| `src/components/i18n/` | 界面文字的中英字典和把当前语言交给客户端组件的 Provider | 表现层 |
| `src/components/companion/` | 小熊：一句话规则、行为规则、精灵图播放器和帧清单 | Companion 表现层 |
| `src/components/trip-workspace/` | 聊天、右侧字段编辑、目的地卡、状态同步、准备度按钮 | Workspace 表现层 |
| `src/components/ui/` | 已使用的基础 UI：动画 Popover、动画复选框、像素标题、骨架占位块 | UI 基础组件 |
| `src/domain/` | 数据类型、校验、状态变换、纯业务规则，无网络/数据库 IO | 领域层（domain layer），回答“什么是合法业务状态” |
| `src/domain/trip/` | Trip 身份、访客归属、生命周期及错误 | Journey 根实体 |
| `src/domain/trip-state/` | 权威旅程字段、目的地层级、删除规则、准备度及聊天修改契约 | 状态与领域规则 |
| `src/domain/trip-draft/` | 首页自然语言提取的草稿契约 | 输入领域模型 |
| `src/domain/trip-message/` | 持久化消息、支持的 presentation、选择项偏好身份 | 会话领域模型 |
| `src/domain/location/` | 地点候选、建议、合理匹配规则和推荐校验 | 地点领域模型及纯规则 |
| `src/domain/locale/` | 支持的语言（zh/en）与 `<html lang>` 取值 | 领域层基础类型 |
| `src/capabilities/` | 围绕具体能力组织服务、用例、prompt 和流程编排 | 应用层（application layer），回答“完成一个操作需要哪些步骤” |
| `src/capabilities/journey/` | 创建、加载、更新、删除 Journey 和草稿提取 | Journey 应用用例 |
| `src/capabilities/conversation/` | 模型解释、开场、历史上下文和消息保存 | 对话应用用例 |
| `src/capabilities/destination/` | 高德查询协调、层级映射、候选准备、提交复核 | 目的地应用用例 |
| `src/capabilities/recommendation/` | 搜索启发、结构化推荐、省份过滤和消息编排 | 推荐应用用例；确定性 workflow |
| `src/platform/` | 提供外部调用接口和具体实现 | 基础设施/集成层（infrastructure layer），端口与适配器 |
| `src/platform/llm/` | 模型客户端契约、Kimi 调用、SDK 错误与超时适配 | 模型提供方适配 |
| `src/platform/location-provider/` | 地点搜索/输入建议接口和高德 HTTP 实现 | 地图提供方适配 |
| `src/platform/search/` | Discovery Search 接口及 Bocha 请求/响应适配 | 搜索提供方适配 |
| `src/platform/place-photos/` | 地点照片接口和高德照片实现（https 升级、主机白名单、只存真实答案的 7 天缓存） | 照片提供方适配 |
| `src/platform/amap/` | 所有高德请求共用的节流与限流重试 | 高德提供方共用基础设施 |
| `src/platform/persistence/` | repository 接口，隔离应用层与数据库实现 | 持久化端口；这里的接口不等于 SQL 实现 |
| `src/platform/persistence/postgres/` | PostgreSQL repository，读取校验、错误包装、CAS 更新 | 持久化适配器 |
| `src/platform/persistence/in-memory/` | 内存 repository，用于测试替身 | 持久化测试适配器 |
| `src/platform/persistence/database/` | Neon/Drizzle 连接与 schema | 数据库连接及表结构 |
| `src/platform/identity/` | guest cookie 创建和读取 | 访客身份基础设施 |
| `src/platform/locale/` | 语言 cookie 的读写规则与按请求取语言（cookie → Accept-Language） | 访客偏好基础设施 |
| `src/platform/observability/` | 结构化日志、错误序列化及脱敏 | 可观测性基础设施 |

“业务层”容易同时指两层：`domain` 定义规则，`capabilities` 编排用例。“数据调用层”最好具体说成持久化适配器、地图适配器或模型适配器；数据库、HTTP 提供方和 LLM 是不同边界。

## 3. 向用户讲解当前架构

### 3.1 总体结构与调用方向

Meri 是一个以 Journey 为中心的 Next.js 全栈应用。代码在同一仓库、同一应用内分模块组织，可以称为分层的模块化单体；不是微服务。`capabilities` 按业务能力分目录，`domain` 保留可测试的纯规则，`platform` 封装数据库和外部提供方。

```text
浏览器：React 组件 + 前端模型
    ↓ HTTP 请求
Next.js route：输入/身份检查 + 响应转换 + 部分流程编排
    ↓ 调用
应用用例：Journey / Conversation / Destination / Recommendation
    ├─ 领域规则：校验、合并、删除、准备度（纯函数，无 IO）
    └─ 外部端口：Repository / LocationProvider / 模型客户端 / Search
           ↓ 具体适配器
       Neon PostgreSQL / 高德 / Kimi / Bocha
    ↓ 返回保存的状态和消息
UI 同步状态；刷新从数据库恢复
```

这是当前代码的职责划分，不要包装成严格执行全部 Clean Architecture 约束的框架：repository/provider 端口目前放在 `platform`；`*-instance.ts` 装配生产实现；某些 route 自己协调多个步骤；部分组件直接请求本应用 API；搜索上下文类型也存在跨目录引用。未来是否调整要由具体问题驱动。

### 3.2 三种核心数据与一个读模型

| 名称 | 保存什么 | 权威与边界 |
| --- | --- | --- |
| Trip | ID、ownerGuestId、status、时间戳 | Journey 身份与生命周期根；不重复保存旅程字段 |
| TripState | name、origin、destination、startDate、endDate、duration、transportPreference | 当前用户决定的权威状态 |
| TripMessage | 用户/助手原文，助手可附受限 presentation | 真实历史和待选卡，不等于已保存偏好 |
| JourneySummary | 从 Trip + TripState 投影出的列表信息 | 读模型，不是另一份可写事实来源 |

当前数据库 schema 有 `trips`、`trip_states`、`trip_messages`。推荐只从聊天触发（`source=conversation`），没有推荐按钮入口，也不写独立 action 表。历史迁移 `0007` 曾创建 `trip_user_actions`，`0009` 已定义删除该表；仓库文件不能证明任何环境已经实际执行迁移。

普通字段可以 known/approximate/ambiguous/missing。destination 只有 missing/known，known 保存 `areas: [{ province, places: [{ name, spots: string[] }] }]`，可能带待确认旧文本 `legacyText`。展示文案从结构派生；spot 目前是想去的名称，不是精确 POI ID 或坐标。

### 3.3 AI 和应用各自决定什么

LLM 解释自然语言并提出受限 JSON；应用校验、决定是否执行、核验地点并保存。助手建议即使经过高德核验，仍需要用户显式确认才成为目的地。Gen UI 是受限数据驱动的预写 React 组件，不是模型生成 JSX。

推荐是确定性流程：Discovery Search → Kimi 结构化推荐（含配图用的代表地标）→ 校验/去重 → 省份过滤 → 保存建议（卡片带地标、无照片）→ 浏览器另行请求照片，服务器按地标查高德、逐张流式返回并写回卡片消息 → 显式选中时复核高德。代码没有接通访问检查、排序或开放式 Research Agent；照片只是装饰。Generate plan 当前只检查准备度；PWA 有 manifest 和图标，没有离线 service worker。

### 3.4 两条实际操作链

**首页新建：**`new-trip-composer` → `POST /api/trip-drafts` → extractor + prompt + 领域校验 → `POST /api/journeys` → `createJourneyWithOpening` → JourneyService 保存身份/状态/原话及候选开场，或在创建后生成普通 opening → Workspace。

**聊天选目的地：**`conversation-panel` + transport → `POST /api/trip-workspace/messages` → interpreter → 普通字段 patch 保存 → `applyDestinationEdit`（用户原话中的精确地点直接写入，其余准备候选）→ 保存用户/助手消息 → `destination-choices-card` 多选 → selection route 从保存的 offer 校验 ID、资格和目标 → 高德复核 → JourneyService CAS 更新 → 保存固定确认消息 → UI 同步。

右侧手动搜索独立走 destinations API；出发地输入建议走 locations/suggestions API；普通字段编辑走 state PATCH。不能把它们都描述为聊天模型调用。

## 4. 必须保留的业务边界与实现局限

1. 同省/市/spot 的多个 POI 可在聊天卡中合并成一个偏好选择；不同省市或不同 spot 仍独立。合并偏好不等于精确 POI 消歧。
2. add/set 只追加，不删除已保存项。用户原话里、被高德精确匹配的地点直接写入；错别字、多个可能、宽泛区域、模型改写的名称生成追加待选卡。用户明确不去某个地点才通过 remove 删除对应项。历史 replace 卡仍按原基底和过期规则处理，新聊天不再生成整体替换卡。
3. 删除 city 同时删除其 spots，并保留 province；删除 spot 保留 city；删除 province 删除全部子项。聊天删除用当前状态的精确名称或唯一前缀，手动删除传完整省/市/spot 元组。
4. 已确认卡片和后续对话之前的旧卡只读。服务端也检查过期，安全的同组选项重试复用确认消息；不能让旧卡恢复后来删除的地点。
5. CAS（比较并交换）以读取的状态为前提更新。生产 PostgreSQL 用原始 JSONB 作为条件；JourneyService 最多重试 3 次。目的地操作带 expectedDestination，冲突拒绝套用旧目的地；普通字段重试重算，保留并发变更。
6. 状态更新与会话保存仍是分开的步骤，不是跨全部流程的一笔事务。选卡状态成功而确认消息失败时，返回实际 TripState 和 `follow_up_unavailable`；普通聊天失败则需刷新核对。
7. 旧自由文本保留 `legacyText`，不伪造行政身份。准备度只要求已有目的地且无待确认旧记录；只有省、没有市也可以开始规划。未来研究应从当前 TripState 取偏好，不能从旧聊天恢复删除项。
8. 通用 state PATCH 当前接受领域校验后的 patch，仍能包含 destination；它并非所有目的地请求都统一高德核验的入口。专用目的地接口有更明确的核验/并发边界。state route 的错误映射当前也未将 TripStateConflictError 单独映射成 409。这些是实现边界，本文没有顺带修改代码。
9. `workspace-turn-branch.ts` 和旧 `destination-recommendation-picker.tsx` 仍在仓库并有测试，但当前主聊天链路不使用它们；实际聊天分支在 messages route，当前卡片在 `destination-choices-card.tsx`。

旧 `destination-refactor-plan.md` 已完成历史使命。其有效决定在本节及当前业务文档中保留；旧设计中稳定地理 ID、spot 坐标、撤销提示、省内限定搜索等建议没有实现，也不因此成为待执行任务。历史审查和具体旧方案可从 Git 历史查看。

## 5. 给 AI 的按任务阅读路径及后续扩展原则

| 任务 | 应读源码与对应测试 | 应读业务文档 |
| --- | --- | --- |
| 首页创建或 opening 重试 | composer/model、trip-drafts/journeys/initialize routes、journey extractor/create-with-opening/service、opening service | USER_FLOW_CURRENT 第 1–2 节 |
| 聊天解释、字段更新、推荐触发 | messages route、interpreter/prompt、workspace-conversation、recommendation use case、历史上下文和 transport | 第 3 节及第 6 节 |
| 目的地省市/spot、搜索、删除 | destination-areas、apply-edit、resolve-place、location service/provider、destinations route、destination editor | 第 3.2、5.2–5.3 节 |
| 卡片合并、过期或安全重试 | choice identity、verified choice、selection route、selection message ID、UI adapter、choices card、conversation panel | 第 4 节及第 7.2–7.3 节 |
| 推荐生成与搜索降级 | recommendation context/generator/prompt/workflow/use case、Discovery Search/Bocha | 第 4.1 节 |
| 日期/交通/出发地直接编辑 | brief panel、location editor/model、trip-state persistence model、state/suggestions routes | 第 5.1 节 |
| Generate plan 准备度 | planning-readiness、readiness route/model、generate-plan action | 第 5.4 节 |
| 保存、并发、列表或删除 | Journey/Trip services、repository 接口、Postgres 实现、schema、my-journeys 和相关页面 | 第 1.1、2.3、7 节 |
| 视觉或动画 | 对应 TSX/CSS、现有 UI 组件及引用的 public 资源 | 涉及操作变化时同步相应业务章节 |

当前规模适合保留一个完整导航文件；“能够列全”不意味着“每次必须读全”。根 `AGENTS.md` 放共用规则，`CLAUDE.md` 引用它并提供导航，避免两份入口复制后逐渐分叉。

以后某模块出现独立规则或复杂文档时，再在该目录增加局部说明/指令，根入口仅保留索引和共用约束；是否自动加载取决于实际使用的工具，不能假定所有 AI 都递归加载。全量文件目录可以按模块拆分，但详细业务流程仍保留。此次没有提前搭建分层文档系统或增加各目录 AGENTS。

## 6. 项目文件逐项索引

下表按目录分类，每个路径都有独立一行。测试不是运行时业务层；同目录测试主要验证对应层的规则或适配边界，多数使用 mock/内存替身，不据此宣称真实提供方已验证。

本次索引按路径去重共 318 个文件，其中 82 个测试文件。

### 6.1 根目录配置与入口

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [.env.example](../.env.example) | 工程配置 | 服务端环境变量模板，提供数据库、Kimi、高德、Bocha、时区和日志配置示例；不放真实密钥。 |
| [.gitignore](../.gitignore) | 工程配置 | 忽略依赖、构建结果、环境密钥、日志和 TypeScript 生成文件。 |
| [AGENTS.md](../AGENTS.md) | 文档/开发约定 | 所有 AI 的共同入口：必读文档、Git 修改保护、当前业务边界及 Next.js 本地指南要求。 |
| [.claude/launch.json](../.claude/launch.json) | 开发工具配置 | Claude 浏览器预览面板启动 `npm run dev`（端口 3000）的配置，不影响应用运行。 |
| [CLAUDE.md](../CLAUDE.md) | 文档/开发约定 | Claude 入口，以 @AGENTS.md 引用共用规则，补充导航链接，避免复制规则。 |
| [README.md](../README.md) | 文档/开发约定 | 本地运行、环境变量、检查命令、架构入口和部署说明。 |
| [drizzle.config.ts](../drizzle.config.ts) | 工程配置 | 加载本地环境，指定 PostgreSQL schema 和迁移目录，检查 DATABASE_URL。 |
| [eslint.config.mjs](../eslint.config.mjs) | 工程配置 | ESLint flat config，组合 Next.js 和 TypeScript 规则及忽略项。 |
| [next.config.ts](../next.config.ts) | 工程配置 | Next.js 配置入口：允许 next/image 从高德两个照片主机取图。 |
| [package-lock.json](../package-lock.json) | 工程配置 | 锁定 npm 依赖解析结果，保证安装版本可重现。 |
| [package.json](../package.json) | 工程配置 | 项目信息、依赖与 dev/build/start/lint/test/typecheck 命令。 |
| [tsconfig.json](../tsconfig.json) | 工程配置 | TypeScript 编译/检查、路径别名及 Next.js 类型配置。 |

### 6.2 文档

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | 文档/开发约定 | 当前模型权威、模块分工、目的地选择和并发边界；区分已实现与未来研究。 |
| [docs/CODEBASE_GUIDE.md](../docs/CODEBASE_GUIDE.md) | 文档/开发约定 | 本文件：目录/分层解释、实际调用链、阅读路径及完整逐文件索引。 |
| [docs/CODING_PRINCIPLES.md](../docs/CODING_PRINCIPLES.md) | 文档/开发约定 | 代码命名、扁平流程、外部适配、校验、日志和交付检查约定。 |
| [docs/DATABASE_SCHEMA.md](../docs/DATABASE_SCHEMA.md) | 文档/开发约定 | 数据库相关目录、三张表的字段/约束/关系、JSONB 状态、读写代码和迁移历史。 |
| [docs/PROJECT.md](../docs/PROJECT.md) | 文档/开发约定 | 产品愿景、当前 MVP、用户决定原则、规划方向及当前非目标。 |
| [docs/USER_FLOW_CURRENT.md](../docs/USER_FLOW_CURRENT.md) | 文档/开发约定 | 向用户讲解的详细业务材料：入口、模型 JSON、每个操作的 API/代码、状态变化、错误、并发与兼容。 |
| [docs/product/adaptive-workspace.md](../docs/product/adaptive-workspace.md) | 文档/开发约定 | 精简的未来界面方向：按用户决定调整信息重点，保留状态和受控组件边界，不预选框架。 |
| [docs/product/companion-bear.md](../docs/product/companion-bear.md) | 文档/开发约定 | 小熊设计说明：营地小桌精灵图方案、动作清单和“反应优先、自由时间随机”的行为逻辑；素材与行为已实现，文中列出仍待定的部分。 |
| [docs/product/visual-media-direction.md](../docs/product/visual-media-direction.md) | 文档/设计探索 | 保存页面评审与图像、视频、Web3D、分享产物讨论，区分已认可方向、待讨论细节和灵感；记录高德照片的当前展示位置，未在本次实施功能。 |

### 6.3 App Router 页面与 HTTP 接口

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/app/api/health/route.ts](../src/app/api/health/route.ts) | HTTP 接口层 | GET /api/health 返回 ok 并记录请求日志，不检查数据库或提供方健康。 |
| [src/app/api/journeys/route.ts](../src/app/api/journeys/route.ts) | HTTP 接口层 | POST /api/journeys 获取/创建访客身份，校验草稿和原话，创建 Journey 并协调 opening。 |
| [src/app/api/locations/suggestions/route.test.ts](../src/app/api/locations/suggestions/route.test.ts) | 测试（对应模块边界） | 验证建议 API 的正常输出、空/过长 query、提供方失败及不暴露请求密钥。 |
| [src/app/api/locations/suggestions/route.ts](../src/app/api/locations/suggestions/route.ts) | HTTP 接口层 | GET /api/locations/suggestions 校验 query，返回规范化输入建议及提供方错误。 |
| [src/app/api/trip-drafts/route.ts](../src/app/api/trip-drafts/route.ts) | HTTP 接口层 | POST /api/trip-drafts 校验原话，带上访客语言调用模型草稿提取（旅程名用该语言），返回草稿或模型错误；不创建 Journey。 |
| [src/app/api/trip-workspace/messages/route.ts](../src/app/api/trip-workspace/messages/route.ts) | HTTP 接口层 | POST 聊天的实际编排：归属/历史、模型解释、普通字段保存、地点 edit（精确地点直接写入）、推荐范围判断与 pending 标记、保存真实消息及错误映射。 |
| [src/app/api/trips/[id]/conversation/initialize/route.ts](../src/app/api/trips/%5Bid%5D/conversation/initialize/route.ts) | HTTP 接口层 | POST opening 重试：检查访客和 Journey，返回保存的开场或按访客语言初始化合资格开场。 |
| [src/app/api/trips/[id]/destination-recommendation-selection/route.ts](../src/app/api/trips/%5Bid%5D/destination-recommendation-selection/route.ts) | HTTP 接口层 | POST 多选确认：取持久化 offer、验证选择和过期、复核高德、合并/替换、保存确认，处理安全重试和半成功。 |
| [src/app/api/trips/[id]/destination-recommendations/route.ts](../src/app/api/trips/%5Bid%5D/destination-recommendations/route.ts) | HTTP 接口层 | POST 推荐卡片：只接受 `{messageId}`，从保存的对话还原 pending 请求，仅为仍是最新消息的 pending 运行推荐工作流，以派生 ID 保存卡片；已存在则直接返回，过期 409，失败 502。 |
| [src/app/api/trips/[id]/destination-recommendation-photos/route.ts](../src/app/api/trips/%5Bid%5D/destination-recommendation-photos/route.ts) | HTTP 接口层 | POST 推荐卡照片：只接受 `{messageId}`，owner 检查，为该推荐卡消息里还没查过照片的卡逐张查图，每查到一张以 NDJSON 推一行，全部查完写回消息再结束；浏览器离开也查完并保存；非推荐卡 404。 |
| [src/app/api/trips/[id]/destination-photos/route.ts](../src/app/api/trips/%5Bid%5D/destination-photos/route.ts) | HTTP 接口层 | GET 已选地点照片：owner 检查，按当前目的地和对话里卡片展示过的照片返回每个地点一张，private/no-store，不写入任何数据。 |
| [src/app/api/trips/[id]/destinations/route.ts](../src/app/api/trips/%5Bid%5D/destinations/route.ts) | HTTP 接口层 | GET 手动搜索、POST 重查并添加、DELETE 完整元组/旧记录；归属检查、目标核验及目的地并发控制。 |
| [src/app/api/trips/[id]/planning-readiness/route.ts](../src/app/api/trips/%5Bid%5D/planning-readiness/route.ts) | HTTP 接口层 | GET 读取新鲜 TripState，返回 missing/unverified/selected 准备度；不生成计划。 |
| [src/app/api/trips/[id]/route.ts](../src/app/api/trips/%5Bid%5D/route.ts) | HTTP 接口层 | DELETE /api/trips/[id] 只删除当前访客拥有的 Trip，数据库级联清理状态和消息。 |
| [src/app/api/trips/[id]/state/route.ts](../src/app/api/trips/%5Bid%5D/state/route.ts) | HTTP 接口层 | GET 状态/PATCH 领域校验后的 patch；调用 JourneyService，不自行做高德核验，冲突错误当前未单独映射 409。 |
| [src/app/globals.css](../src/app/globals.css) | 页面/框架入口 | 全站基础样式与通用视觉变量。 |
| [src/app/layout.tsx](../src/app/layout.tsx) | 页面/框架入口 | 根布局、字体、全局样式及站点 metadata/图标；按访客语言设置 `<html lang>`、标题/描述，并包上 LocaleProvider。 |
| [src/app/manifest.ts](../src/app/manifest.ts) | 页面/框架入口 | PWA Web App Manifest，声明名称、启动地址、显示方式和图标；不提供离线缓存。 |
| [src/app/page.tsx](../src/app/page.tsx) | 页面/框架入口 | 首页 / 的服务端页面入口，渲染 MeriAppShell。 |
| [src/app/trips/[id]/error.tsx](../src/app/trips/%5Bid%5D/error.tsx) | 页面/框架入口 | Workspace 页面错误边界，按访客语言提供失败提示和重试入口。 |
| [src/app/trips/[id]/page.tsx](../src/app/trips/%5Bid%5D/page.tsx) | 页面/框架入口 | Workspace 服务端加载入口，检查归属、读取状态/消息，区分 404 与缺失状态；最多等 1.5 秒带上已选地点照片；页面标题与缺失状态提示按访客语言。 |
| [src/app/trips/journey-delete-action.tsx](../src/app/trips/journey-delete-action.tsx) | 页面/框架入口 | 列表页客户端删除控件，调用 owner-scoped DELETE 并更新页面，文字按访客语言。 |
| [src/app/trips/new/page.tsx](../src/app/trips/new/page.tsx) | 页面/框架入口 | 旧 /trips/new 入口重定向至首页，统一新建入口。 |
| [src/app/trips/page.tsx](../src/app/trips/page.tsx) | 页面/框架入口 | /trips 服务端列表，按访客读取 JourneySummary，按访客语言呈现旅程卡、状态和空状态及页面标题。 |
| [src/app/trips/trips.module.css](../src/app/trips/trips.module.css) | 页面/框架入口 | Journey 列表、卡片、背景和响应式布局样式。 |

### 6.4 首页表现层

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/meri-shell/home-entrance.tsx](../src/components/meri-shell/home-entrance.tsx) | 表现层 | Motion 首页分区入场动画，支持减少动态效果偏好；不是背景水彩显露动画。 |
| [src/components/meri-shell/meri-app-shell.module.css](../src/components/meri-shell/meri-app-shell.module.css) | 表现层 | 首页背景、品牌、输入区、角色、布局及响应式样式。 |
| [src/components/meri-shell/meri-app-shell.tsx](../src/components/meri-shell/meri-app-shell.tsx) | 表现层 | 首页服务端外壳，读取最近旅程和访客语言，组合 Profile、语言切换、品牌、标题（英文像素字体，中文用系统字体的普通 h1）、输入、角色和 HomeEntrance。 |
| [src/components/meri-shell/new-trip-composer-model.test.ts](../src/components/meri-shell/new-trip-composer-model.test.ts) | 测试（对应模块边界） | 验证空输入、提取/创建失败、保留输入、真实 Trip ID 导航及重试不重复创建。 |
| [src/components/meri-shell/new-trip-composer-model.ts](../src/components/meri-shell/new-trip-composer-model.ts) | 表现层 | 首页 reducer 与请求模型：提取草稿、创建 Journey、处理 opening_failed 和导航。 |
| [src/components/meri-shell/new-trip-composer.tsx](../src/components/meri-shell/new-trip-composer.tsx) | 表现层 | 首页客户端输入组件，绑定阶段、错误、创建导航和 opening 重试操作。 |
| [src/components/meri-shell/recent-journey-actions.tsx](../src/components/meri-shell/recent-journey-actions.tsx) | 表现层 | 首页单张卡片的操作菜单，触发删除并隔离卡片导航。 |
| [src/components/meri-shell/recent-journey-deletion.test.ts](../src/components/meri-shell/recent-journey-deletion.test.ts) | 测试（对应模块边界） | 验证 owner-scoped DELETE、失败不报成功及并发重复删除的控制。 |
| [src/components/meri-shell/recent-journey-deletion.ts](../src/components/meri-shell/recent-journey-deletion.ts) | 表现层 | 首页删除请求及请求去重，失败时仍允许重试。 |
| [src/components/meri-shell/recent-journeys-markup.test.tsx](../src/components/meri-shell/recent-journeys-markup.test.tsx) | 测试（对应模块边界） | 验证旅程导航和操作控件为同级元素，避免交互控件嵌套造成误导航。 |
| [src/components/meri-shell/recent-journeys-model.test.ts](../src/components/meri-shell/recent-journeys-model.test.ts) | 测试（对应模块边界） | 验证空/单/多旅程、显示数量、首尾循环切换与交互目标的导航规则。 |
| [src/components/meri-shell/recent-journeys-model.ts](../src/components/meri-shell/recent-journeys-model.ts) | 表现层 | 纯前端规则：最近列表、可见数量、首尾循环的下一索引及点击导航边界。 |
| [src/components/meri-shell/recent-journeys.module.css](../src/components/meri-shell/recent-journeys.module.css) | 表现层 | 最近旅程卡片、轮播箭头及操作样式；局部圆角与透明遮罩柔化两侧卡片及视口切口，中央卡片保持清晰。 |
| [src/components/meri-shell/recent-journeys.tsx](../src/components/meri-shell/recent-journeys.tsx) | 表现层 | 最近旅程 React 组件，适配 Aceternity Carousel 的居中平移轨道、透视缩放及 Motion 悬停视差；支持循环切换、手势、键盘、导航和删除后的列表更新。 |
| [src/components/i18n/messages.ts](../src/components/i18n/messages.ts) | 表现层 | 界面文字中英字典（首页、最近旅程、旅程页面各区域、我的旅程列表），英文定结构、中文类型上必须对应，带参数的句子与日期格式为函数。 |
| [src/components/i18n/locale-context.tsx](../src/components/i18n/locale-context.tsx) | 表现层 | LocaleProvider 与 useLocale/useMessages；Provider 之外默认英文（仅测试中出现）。 |

### 6.5 Workspace 表现层

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/companion/bear-behavior.test.ts](../src/components/companion/bear-behavior.test.ts) | 测试（对应模块边界） | 用固定随机数模拟数百次计划：验证不瞬移、同一活动不连续三次、饭后 60 秒冷却、坐着偏好、反应优先及每次旅程变化只欢呼一次，并校验帧清单。 |
| [src/components/companion/bear-behavior.ts](../src/components/companion/bear-behavior.ts) | 表现层 | 小熊行为纯规则：反应（出错/思考/可生成）优先，自由时间按权重随机选看地图/站着/吃饭团/放空，并补上坐下、放下地图等过渡步骤。 |
| [src/components/companion/bear-sprite-sheet.ts](../src/components/companion/bear-sprite-sheet.ts) | 表现层 | 读取并用 Zod 校验生成的 bear-sprites.json，导出帧尺寸、每个动画的行号/帧数/时长和精灵图地址。 |
| [src/components/companion/companion-bear.tsx](../src/components/companion/companion-bear.tsx) | 表现层 | 精灵图播放器：按计划逐帧播放，计划结束或反应变化时向行为规则要下一步（过渡中不打断），标签页隐藏时暂停，减少动态效果时只显示一帧。 |
| [src/components/companion/companion-status-model.test.ts](../src/components/companion/companion-status-model.test.ts) | 测试（对应模块边界） | 验证小熊一句话的优先级（出错 > 思考 > 可生成 > 缺目的地）、可选缺项列举和旧目的地提示。 |
| [src/components/companion/companion-status-model.ts](../src/components/companion/companion-status-model.ts) | 表现层 | 小熊一句话的纯规则：由 TripState 与聊天活动决定情绪和文案（文案取自传入的字典），不调用模型。 |
| [src/components/companion/companion.module.css](../src/components/companion/companion.module.css) | 表现层 | 小熊区域在旅程列底部的固定位置、对话气泡和像素化精灵图样式。 |
| [src/components/companion/meri-world.tsx](../src/components/companion/meri-world.tsx) | 表现层 | 旅程列底部的小熊与对话气泡：一句话来自 companionStatus，并把同样的状态作为反应交给 CompanionBear。 |
| [src/components/trip-workspace/conversation-panel.tsx](../src/components/trip-workspace/conversation-panel.tsx) | 表现层 | 聊天主组件：useChat、已保存消息、候选卡、卡片关闭/只读、确认及消息逐字显示；最后一条为 pending 时请求推荐卡片并显示加载/重试；推荐卡还有未查照片时逐条消息请求照片流，收到一张补一张；向外上报 idle/thinking/error 活动供小熊使用。 |
| [src/components/trip-workspace/conversation-reveal.test.ts](../src/components/trip-workspace/conversation-reveal.test.ts) | 测试（对应模块边界） | 验证只对已提交文本按字符步进显示，不越界或改写正文。 |
| [src/components/trip-workspace/conversation-reveal.ts](../src/components/trip-workspace/conversation-reveal.ts) | 表现层 | 已提交助手正文的客户端可见字符数/显示节奏纯函数；不是服务端 token 流。 |
| [src/components/trip-workspace/destination-choices-card.test.tsx](../src/components/trip-workspace/destination-choices-card.test.tsx) | 测试（对应模块边界） | 验证同市新 spot 可添加、replace 可选已有市、重复 POI 归并及历史/已确认卡禁用。 |
| [src/components/trip-workspace/destination-choices-card.tsx](../src/components/trip-workspace/destination-choices-card.tsx) | 表现层 | 当前聊天多选卡：每省一行 Embla 横滑、照片在上的地点卡（查照片或下载中显示骨架块、照片淡入，失败或没有照片显示兜底），同偏好归并、统一提交，处理已在行程（勾选锁定）/只读/pending/失败状态，拖动不误勾选。 |
| [src/components/trip-workspace/destination-editor.tsx](../src/components/trip-workspace/destination-editor.tsx) | 表现层 | 右侧目的地行：“＋ 添加”展开搜索；每省一块，每个城市一行、其景点标签排在同一行右侧，均可删除，无城市的省显示“全省”；搜索/显式添加/精确删除及旧记录清除，处理 busy 和错误。 |
| [src/components/trip-workspace/destination-recommendation-model.test.ts](../src/components/trip-workspace/destination-recommendation-model.test.ts) | 测试（对应模块边界） | 验证推荐卡选择资格、省分组、统一提交请求及旧 Picker 渲染兼容。 |
| [src/components/trip-workspace/destination-recommendation-model.ts](../src/components/trip-workspace/destination-recommendation-model.ts) | 表现层 | 提交推荐选卡、请求 pending 回复的推荐卡片、读取推荐卡照片的 NDJSON 流（跨块拼行、坏行跳过、坏照片当无图）、按省归组及选择资格等前端辅助规则。 |
| [src/components/trip-workspace/destination-photos-model.ts](../src/components/trip-workspace/destination-photos-model.ts) | 表现层 | 请求已选地点照片并丢弃不合法项；封面取第一个地点的照片。 |
| [src/components/trip-workspace/destination-photos-model.test.ts](../src/components/trip-workspace/destination-photos-model.test.ts) | 测试（对应模块边界） | 验证照片请求解析与封面选择。 |
| [src/components/trip-workspace/destination-recommendation-picker.module.css](../src/components/trip-workspace/destination-recommendation-picker.module.css) | 表现层 | 目的地候选/推荐多选列表的分组、checkbox、确认及状态样式。 |
| [src/components/trip-workspace/destination-recommendation-picker.tsx](../src/components/trip-workspace/destination-recommendation-picker.tsx) | 表现层 | 保留的旧推荐多选组件及测试入口；当前 ConversationPanel 使用 DestinationChoicesCard。 |
| [src/components/trip-workspace/expedition-brief-panel.tsx](../src/components/trip-workspace/expedition-brief-panel.tsx) | 表现层 | Journey overview 字段面板，按出发地、目的地、何时、交通偏好、旅程名称排列；交通一键点选，名称文本编辑。 |
| [src/components/trip-workspace/field-certainty.tsx](../src/components/trip-workspace/field-certainty.tsx) | 表现层 | 字段把握程度的共享展示：统一 18px 圆形状态（known 实心绿勾、missing 空圈、approximate 琥珀点、ambiguous “!”）、屏幕阅读器文字、把握程度文字（CertaintyLabel）和“大致/待确认”标签，文字取自字典。 |
| [src/components/trip-workspace/generate-plan-action.tsx](../src/components/trip-workspace/generate-plan-action.tsx) | 表现层 | 唯一的 Generate plan，Halo 式旋转渐变边框按钮，位于聊天下方并始终可见；不可用时保持可聚焦并在悬停/聚焦时说明添加目的地的途径（可打开右侧搜索），规划尚未开放。 |
| [src/components/trip-workspace/journey-globe.tsx](../src/components/trip-workspace/journey-globe.tsx) | 表现层 | 装饰地球：改写自 cult-ui Illustration Globe（MIT）的 SVG 线框半球，节点数随已选地点数变化，无地理含义；减少动态效果时静止；由 journey-orbit 包裹。 |
| [src/components/trip-workspace/journey-orbit.tsx](../src/components/trip-workspace/journey-orbit.tsx) | 表现层 | 照片环：已选地点照片绕地球旋转，前大后小、前后遮挡，悬停暂停、点击转到正前方、减少动态效果时静止。 |
| [src/components/trip-workspace/location-editor-model.test.ts](../src/components/trip-workspace/location-editor-model.test.ts) | 测试（对应模块边界） | 验证 query 长度、完整建议解析及已选地点 patch 身份/坐标。 |
| [src/components/trip-workspace/location-editor-model.ts](../src/components/trip-workspace/location-editor-model.ts) | 表现层 | 输入 query 标准化、建议响应校验和出发地 selection patch 构造。 |
| [src/components/trip-workspace/location-editor.tsx](../src/components/trip-workspace/location-editor.tsx) | 表现层 | 当前用于 origin 的输入建议编辑控件，防抖查询、显式选中并保存普通字段；状态图标/标签来自 field-certainty。 |
| [src/components/trip-workspace/message-timestamp.ts](../src/components/trip-workspace/message-timestamp.ts) | 表现层 | 按本地今天/昨天/更早日期格式化聊天时间标签，文字由传入的字典决定（昨天/Yesterday）。 |
| [src/components/trip-workspace/planning-readiness-model.test.ts](../src/components/trip-workspace/planning-readiness-model.test.ts) | 测试（对应模块边界） | 验证只读 readiness 请求、响应校验及缺失/旧文本说明文案。 |
| [src/components/trip-workspace/planning-readiness-model.ts](../src/components/trip-workspace/planning-readiness-model.ts) | 表现层 | 准备度请求、响应校验和说明文案（取自传入的字典）。 |
| [src/components/trip-workspace/trip-dates-editor.tsx](../src/components/trip-workspace/trip-dates-editor.tsx) | 表现层 | “何时”行：一行概括日期与时长，点开为 react-day-picker 范围日历（宽屏两月，中/英 locale 随界面语言）和天数步进器；两次点击定起止后保存，支持清除。 |
| [src/components/trip-workspace/trip-dates-model.test.ts](../src/components/trip-workspace/trip-dates-model.test.ts) | 测试（对应模块边界） | 验证“何时”概括文案、近似原话的标记、日历日与存储日互转不偏移时区，以及 patch 只含用户所选值。 |
| [src/components/trip-workspace/trip-dates-model.ts](../src/components/trip-workspace/trip-dates-model.ts) | 表现层 | “何时”纯辅助：按传入字典的概括文案（精确天数按语言显示，其他写法原样）与整体 certainty、日历 Date 与 YYYY-MM-DD 互转、日期 patch 构造。 |
| [src/components/trip-workspace/trip-message-ui-adapter.test.ts](../src/components/trip-workspace/trip-message-ui-adapter.test.ts) | 测试（对应模块边界） | 验证消息顺序、ID/角色/正文不变、时间格式、历史卡适配和去重追加。 |
| [src/components/trip-workspace/trip-message-ui-adapter.ts](../src/components/trip-workspace/trip-message-ui-adapter.ts) | 表现层 | TripMessage → UIMessage，读取时间/presentation（含 pending 推荐标记），将历史卡转换为统一 choices，按 ID 避免重复追加；列出待查照片的推荐卡、把流式到达的照片放到对应卡上。 |
| [src/components/trip-workspace/trip-state-persistence-model.test.ts](../src/components/trip-workspace/trip-state-persistence-model.test.ts) | 测试（对应模块边界） | 验证确定性状态/来源保留、清空字段、目的地拒绝及服务端响应检查。 |
| [src/components/trip-workspace/trip-state-persistence-model.ts](../src/components/trip-workspace/trip-state-persistence-model.ts) | 表现层 | 普通字段直接编辑的 user patch 与 state PATCH 请求/响应校验，前端拒绝直接 destination 编辑。 |
| [src/components/trip-workspace/trip-workspace.module.css](../src/components/trip-workspace/trip-workspace.module.css) | 表现层 | Workspace 主布局、字段行、聊天、角色区及移动端样式。 |
| [src/components/trip-workspace/trip-workspace.tsx](../src/components/trip-workspace/trip-workspace.tsx) | 表现层 | Workspace 客户端容器，协调权威状态、聊天、右侧编辑和界面区域，持有已选地点照片并在目的地变化后重新请求，把“打开目的地搜索”请求从聊天传到右侧，并把聊天活动传给小熊。 |
| [src/components/trip-workspace/workspace-chat-transport.test.ts](../src/components/trip-workspace/workspace-chat-transport.test.ts) | 测试（对应模块边界） | 验证实际 JSON 契约、临时/持久化消息 ID、presentation 和成功后状态同步。 |
| [src/components/trip-workspace/workspace-chat-transport.ts](../src/components/trip-workspace/workspace-chat-transport.ts) | 表现层 | 把完整聊天 JSON 响应适配为 AI SDK ChatTransport 事件，同步已提交 ID 和状态。 |
| [src/components/trip-workspace/workspace-conversation-model.test.ts](../src/components/trip-workspace/workspace-conversation-model.test.ts) | 测试（对应模块边界） | 验证合法/非法响应、浏览器 fetch 接收者及失败提示，不把未确认发送当已保存。 |
| [src/components/trip-workspace/workspace-conversation-model.ts](../src/components/trip-workspace/workspace-conversation-model.ts) | 表现层 | 请求聊天、解析响应及 selection/推荐过期相关错误类型，校验服务端返回状态和消息。 |
| [src/components/trip-workspace/workspace-header.tsx](../src/components/trip-workspace/workspace-header.tsx) | 表现层 | 品牌/返回首页、旅程标题（左侧缩略图为第一个地点的照片，没有时为默认图）、日期/出发地/交通摘要；日期与“何时”同一写法；保存标签为当前 UI 展示。 |
| [src/components/trip-workspace/workspace-presentation.ts](../src/components/trip-workspace/workspace-presentation.ts) | 表现层 | 页头使用的字段和日期（复用 tripDatesSummary，按传入的字典）显示转换。 |
| [src/components/trip-workspace/workspace-title.ts](../src/components/trip-workspace/workspace-title.ts) | 表现层 | 从当前 name 字段派生 Workspace 标题，缺失时显示调用方传入的默认标题。 |

### 6.6 基础 UI 组件

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/components/ui/animated-popover.tsx](../src/components/ui/animated-popover.tsx) | 表现层 | Radix Popover + Motion 封装，提供受控开关、浮层入退场及减少动态效果支持。 |
| [src/components/ui/animated-checkbox.module.css](../src/components/ui/animated-checkbox.module.css) | 表现层 | 动画复选框的方框、选中、聚焦、禁用与减少动态效果样式。 |
| [src/components/ui/animated-checkbox.tsx](../src/components/ui/animated-checkbox.tsx) | 表现层 | 保留原生 checkbox 语义的复选框，Motion 绘制对勾；用于两个目的地多选卡。 |
| [src/components/ui/pixel-heading-character.module.css](../src/components/ui/pixel-heading-character.module.css) | 表现层 | 像素标题字符布局、字体和动画相关样式。 |
| [src/components/ui/pixel-heading-character.tsx](../src/components/ui/pixel-heading-character.tsx) | 表现层 | 像素字符标题组件，处理字体/字符动画模式和减少动态效果。 |
| [src/components/ui/language-toggle.module.css](../src/components/ui/language-toggle.module.css) | 表现层 | 语言切换的胶囊样式，尺寸配色与首页 Profile 一致，当前语言高亮。 |
| [src/components/ui/language-toggle.tsx](../src/components/ui/language-toggle.tsx) | 表现层 | 「中 \| EN」切换：每种语言用自己的文字命名，点击写 `meri_locale` cookie 并刷新页面。 |
| [src/components/ui/language-toggle.test.tsx](../src/components/ui/language-toggle.test.tsx) | 测试（对应模块边界） | 验证两种语言的名称、lang 属性和当前语言的按下状态。 |
| [src/components/ui/skeleton.module.css](../src/components/ui/skeleton.module.css) | 表现层 | 骨架块底色与呼吸闪烁动画，减少动态效果时静止。 |
| [src/components/ui/skeleton.tsx](../src/components/ui/skeleton.tsx) | 表现层 | 仿 shadcn/ui Skeleton 的占位块（CSS Modules，无 Tailwind），用于推荐卡照片到达前。 |

### 6.7 领域层

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/domain/location/destination-recommendations.test.ts](../src/domain/location/destination-recommendations.test.ts) | 测试（对应模块边界） | 验证省份拼写、顺序、同名变体去重及最多 12 个地点等结构边界。 |
| [src/domain/location/destination-recommendations.ts](../src/domain/location/destination-recommendations.ts) | 领域层 | Zod 推荐省份/城市/理由校验，检查中国省级范围、控制总量并规范化去重。 |
| [src/domain/location/china-destination-scope.ts](../src/domain/location/china-destination-scope.ts) | 领域层 | 中国目的地省级行政区完整名/简称名单，共用范围校验；不替代城市/景点的提供方身份核验。 |
| [src/domain/location/destination-resolution-policy.test.ts](../src/domain/location/destination-resolution-policy.test.ts) | 测试（对应模块边界） | 验证行政/景区后缀、自身市/州前缀、景点旁同名区县让位（行政名之间不让）、兜底前缀匹配（至少 3 字、只在无更严格匹配时）、最后兜底景点（排除设施与景点子项、最多 3 个）、同名歧义、省范围、重复身份及不合理/无效坐标候选。 |
| [src/domain/location/destination-resolution-policy.ts](../src/domain/location/destination-resolution-policy.ts) | 领域层 | 合理名称匹配和候选解析纯规则：原话/后缀/自身市区县前缀匹配，同市景点旁的同名区县让位，兜底匹配带其他前缀的名称，最后兜底提供名称含原话的景点（最多 3 个，排除景点的一部分）；返回 resolved/ambiguous/area/unresolved，保留不同 POI 身份。 |
| [src/domain/location/location-suggestion.ts](../src/domain/location/location-suggestion.ts) | 领域层 | 输入建议 LocationSuggestion 类型，包含可能缺失的身份/坐标，与最终目的地确认分开；本文件不执行校验。 |
| [src/domain/location/location.ts](../src/domain/location/location.ts) | 领域层 | 规范化 LocationCandidate，包含提供方身份、行政归属、地址和坐标，以及可选的 kind（是否景点）。 |
| [src/domain/location/place-image.ts](../src/domain/location/place-image.ts) | 领域层 | 地点照片类型（https 链接 + 说明文字）与读取校验，不合法时视为没有照片。 |
| [src/domain/locale/locale.ts](../src/domain/locale/locale.ts) | 领域层 | 支持的语言 zh/en、合法性判断及 `<html lang>` 取值。 |
| [src/domain/location/recommendation-identity.test.ts](../src/domain/location/recommendation-identity.test.ts) | 测试（对应模块边界） | 验证等价名称归一化，保留不同山峰/路线/相似地名的独立性。 |
| [src/domain/location/recommendation-identity.ts](../src/domain/location/recommendation-identity.ts) | 领域层 | 推荐名和地区名标准化，处理空白、全角及受支持后缀，不做地点网络核验。 |
| [src/domain/trip-draft/trip-draft.test.ts](../src/domain/trip-draft/trip-draft.test.ts) | 测试（对应模块边界） | 验证近似时间原话、不完整草稿、出发地/交通及目的地 edit 的合法性。 |
| [src/domain/trip-draft/trip-draft.ts](../src/domain/trip-draft/trip-draft.ts) | 领域层 | TripDraft 和交通枚举，校验首页提取的六类字段及 destinationEdit；模型输出用 salvageTripDraft 逐项挽救（坏字段按 missing），请求体用 validateTripDraftDomain 严格校验。 |
| [src/domain/trip-message/destination-choice-identity.ts](../src/domain/trip-message/destination-choice-identity.ts) | 领域层 | 构造省/市/spot 偏好 ID，把重复 POI 展示合并，同时保留历史提交原 ID。 |
| [src/domain/trip-message/destination-choice-message.test.ts](../src/domain/trip-message/destination-choice-message.test.ts) | 测试（对应模块边界） | 验证 city/spot/replace 基底的新卡持久化，以及旧候选读取与非法新卡拒绝。 |
| [src/domain/trip-message/trip-message.test.ts](../src/domain/trip-message/trip-message.test.ts) | 测试（对应模块边界） | 验证消息角色/正文/时间、presentation 形状和历史推荐兼容。 |
| [src/domain/trip-message/trip-message.ts](../src/domain/trip-message/trip-message.ts) | 领域层 | 用户/助手消息与四类受限 presentation（含推荐 pending 标记及 RecommendationScope，卡片可带照片；推荐卡带地标、照片分未查/有图/null 三态）校验，最多 12 个 choices，历史格式保留读取。 |
| [src/domain/trip-state/destination-areas-v2.test.ts](../src/domain/trip-state/destination-areas-v2.test.ts) | 测试（对应模块边界） | 验证同市多个 spots、删除市级联但保留省、单删 spot 及新版层级约束。 |
| [src/domain/trip-state/destination-areas.test.ts](../src/domain/trip-state/destination-areas.test.ts) | 测试（对应模块边界） | 验证省市/spot 文案、保留空省、多项添加/删除和派生展示规则。 |
| [src/domain/trip-state/destination-areas.ts](../src/domain/trip-state/destination-areas.ts) | 领域层 | 省市/spot 类型和纯函数：格式化（直辖市的景点紧跟市名：北京市（故宫））、标题（超过两省缩写为“…等N省”）、计数、包含、去重添加、新增部分（destinationAdditions）、级联删除、唯一匹配及结构读取。 |
| [src/domain/trip-state/destination-edit.ts](../src/domain/trip-state/destination-edit.ts) | 领域层 | none/add/set/remove 契约、严格模型 JSON Schema、表达数量/长度/去重校验。 |
| [src/domain/trip-state/destination-legacy-read.test.ts](../src/domain/trip-state/destination-legacy-read.test.ts) | 测试（对应模块边界） | 验证旧自由文本保留为 legacyText，不把未核验名称假装成市。 |
| [src/domain/trip-state/planning-readiness.test.ts](../src/domain/trip-state/planning-readiness.test.ts) | 测试（对应模块边界） | 验证缺目的地、只有省、省市混合、旧文本和已选城市的准备度；其他字段不是硬门槛。 |
| [src/domain/trip-state/planning-readiness.ts](../src/domain/trip-state/planning-readiness.ts) | 领域层 | 纯准备度规则：missing、unverified 或 selected（只有省也算 selected）；仅检查状态，不研究可行性。 |
| [src/domain/trip-state/trip-dates.test.ts](../src/domain/trip-state/trip-dates.test.ts) | 测试（对应模块边界） | 验证含首尾计数、任意两项补算第三项、修改哪项决定补算哪项、跨月跨年/闰日，以及近似/非法值不参与。 |
| [src/domain/trip-state/trip-dates.ts](../src/domain/trip-state/trip-dates.ts) | 领域层 | 开始/结束/时长纯规则：解析精确日期与 N天，按本次修改的字段补算第三项（含首尾计数），近似值与结束早于开始时不补算。 |
| [src/domain/trip-state/trip-state.test.ts](../src/domain/trip-state/trip-state.test.ts) | 测试（对应模块边界） | 验证草稿初始化、显式目的地选择、默认名称/用户名称保护、patch 校验与字段状态，以及 patch 时日期三项补算。 |
| [src/domain/trip-state/trip-state.ts](../src/domain/trip-state/trip-state.ts) | 领域层 | 七类权威字段、certainty/source、初始化/patch（patch 时按 trip-dates 补算日期三项）、目的地展示与推荐资格、旧 destination 读取兼容。 |
| [src/domain/trip-state/workspace-conversation.test.ts](../src/domain/trip-state/workspace-conversation.test.ts) | 测试（对应模块边界） | 验证目的地不混入普通 patch、certainty/source、无修改、非法字段及重复修改拒绝。 |
| [src/domain/trip-state/workspace-conversation.ts](../src/domain/trip-state/workspace-conversation.ts) | 领域层 | 四项模型解释契约，逐项挽救 changes/目的地 edit/三种推荐意图（坏的单项丢弃，只有缺少可用 reply 才失败），另有严格版校验；普通 changes 以当前状态为参照丢弃无变化项后转 user patch；交通可清空为 missing。 |
| [src/domain/trip/trip-errors.ts](../src/domain/trip/trip-errors.ts) | 领域层 | Trip 输入非法与未找到错误，供服务及 route 区分业务失败。 |
| [src/domain/trip/trip.ts](../src/domain/trip/trip.ts) | 领域层 | Trip 身份/owner/status/time 类型及创建输入校验，不包含可变旅程字段或 IO。 |

### 6.8 Journey 应用用例

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/journey/create-journey-with-opening.test.ts](../src/capabilities/journey/create-journey-with-opening.test.ts) | 测试（对应模块边界） | 验证开场候选不直接保存目的地、查询失败事实和 opening 失败时 Journey 可恢复。 |
| [src/capabilities/journey/create-journey-with-opening.ts](../src/capabilities/journey/create-journey-with-opening.ts) | 应用层/用例装配 | 创建协调：校验草稿、以 missing 基底执行地点 edit，精确地点作为初始目的地，其余保存固定开场与候选，否则调用普通 opening。 |
| [src/capabilities/journey/destination-concurrency.test.ts](../src/capabilities/journey/destination-concurrency.test.ts) | 测试（对应模块边界） | 验证过期目的地写入拒绝、普通字段冲突重试及保留同时保存的地点。 |
| [src/capabilities/journey/journey-errors.ts](../src/capabilities/journey/journey-errors.ts) | 应用层/用例装配 | Journey 创建/清理失败、缺失状态和 CAS 冲突错误。 |
| [src/capabilities/journey/journey-service-instance.ts](../src/capabilities/journey/journey-service-instance.ts) | 应用层/用例装配 | 装配 TripService、Postgres state repository、消息服务及创建失败清理。 |
| [src/capabilities/journey/journey-service.test.ts](../src/capabilities/journey/journey-service.test.ts) | 测试（对应模块边界） | 验证不完整 Journey、状态/消息失败回滚、读取缺失、patch 和删除等应用边界。 |
| [src/capabilities/journey/journey-service.ts](../src/capabilities/journey/journey-service.ts) | 应用层/用例装配 | Trip + TripState 协调用例，创建（可带精确匹配的初始目的地）及补偿回滚、加载、删除、最新状态 patch 及最多三次 CAS 重试。 |
| [src/capabilities/journey/journey-summary-repository-instance.ts](../src/capabilities/journey/journey-summary-repository-instance.ts) | 应用层/用例装配 | 将数据库装配为生产 PostgresJourneySummaryRepository。 |
| [src/capabilities/journey/my-journeys.test.ts](../src/capabilities/journey/my-journeys.test.ts) | 测试（对应模块边界） | 验证匿名空列表、owner-scoped 列表及读取模型边界。 |
| [src/capabilities/journey/my-journeys.ts](../src/capabilities/journey/my-journeys.ts) | 应用层/用例装配 | 用既有访客身份读取 JourneySummary，缺身份返回空列表，不创建新身份。 |
| [src/capabilities/journey/prompts/trip-draft-prompt.test.ts](../src/capabilities/journey/prompts/trip-draft-prompt.test.ts) | 测试（对应模块边界） | 验证草稿 prompt 的不确定性/原话保留、共享字段语义及旅程名按首页语言。 |
| [src/capabilities/journey/prompts/trip-draft-prompt.ts](../src/capabilities/journey/prompts/trip-draft-prompt.ts) | 应用层/用例装配 | 首页草稿提取系统 prompt，带参考日期、时区和首页语言（推断的旅程名用该语言写），约束 certainty 与目的地操作；地名规则按语言分写（中文原样，英文换成中文名）。 |
| [src/capabilities/journey/prompts/trip-state-field-guidance.ts](../src/capabilities/journey/prompts/trip-state-field-guidance.ts) | 应用层/用例装配 | 草稿与 Workspace 共享的普通字段 certainty 和业务语义提示块；精确日期写 YYYY-MM-DD、精确天数写 N天，并说明应用会补算第三项；英文界面另加一句：大概的值保持用户的英文原话（a week）。 |
| [src/capabilities/journey/trip-draft-extractor.test.ts](../src/capabilities/journey/trip-draft-extractor.test.ts) | 测试（对应模块边界） | 验证有效提取不创建 Trip、空输入先拒绝、模型请求/非法输出和截断错误。 |
| [src/capabilities/journey/trip-draft-extractor.ts](../src/capabilities/journey/trip-draft-extractor.ts) | 应用层/用例装配 | 首页提取 JSON Schema 和结构化模型调用，处理请求/截断/输出错误，挽救草稿并记录丢弃项。 |
| [src/capabilities/journey/trip-service-instance.ts](../src/capabilities/journey/trip-service-instance.ts) | 应用层/用例装配 | 将 PostgresTripRepository 与数据库装配成生产 TripService。 |
| [src/capabilities/journey/trip-service.test.ts](../src/capabilities/journey/trip-service.test.ts) | 测试（对应模块边界） | 验证只创建根身份字段、默认 idea、读取/删除及归属保护。 |
| [src/capabilities/journey/trip-service.ts](../src/capabilities/journey/trip-service.ts) | 应用层/用例装配 | 创建/读取/按 owner 处理 Trip 根身份与生命周期，依赖 TripRepository。 |
| [src/capabilities/journey/workflow.md](../src/capabilities/journey/workflow.md) | 应用层说明 | Journey 创建/加载/列表/删除的短说明；详细开场和业务边界查 USER_FLOW_CURRENT。 |

### 6.9 Conversation 应用用例

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/conversation/conversation-history-content.ts](../src/capabilities/conversation/conversation-history-content.ts) | 应用层/用例装配 | 将保存的 presentation 写成“展示过的卡片”上下文，明确待选卡不是用户决定。 |
| [src/capabilities/conversation/destination-missing-guidance.ts](../src/capabilities/conversation/destination-missing-guidance.ts) | 应用层/用例装配 | 已停用的缺目的地引导消息的稳定 ID；Meri 不再写该消息，只用于在旧历史中识别并跳过它。 |
| [src/capabilities/conversation/destination-selection-message-id.test.ts](../src/capabilities/conversation/destination-selection-message-id.test.ts) | 测试（对应模块边界） | 验证历史身份不变、卡片/类型不冲突、选择顺序无关及 UUID 合法。 |
| [src/capabilities/conversation/destination-selection-message-id.ts](../src/capabilities/conversation/destination-selection-message-id.ts) | 应用层/用例装配 | 从 Trip、offer 和排序后的选择组合派生稳定确认 UUID，兼容旧候选身份；也从 pending 消息派生推荐卡片消息 UUID。 |
| [src/capabilities/conversation/opening-assistant-id.test.ts](../src/capabilities/conversation/opening-assistant-id.test.ts) | 测试（对应模块边界） | 验证开场 UUID 稳定、合法及按 Trip 区分。 |
| [src/capabilities/conversation/opening-assistant-id.ts](../src/capabilities/conversation/opening-assistant-id.ts) | 应用层/用例装配 | 根据 Trip ID 派生稳定的开场助手 UUID。 |
| [src/capabilities/conversation/opening-conversation-service-instance.ts](../src/capabilities/conversation/opening-conversation-service-instance.ts) | 应用层/用例装配 | 将 JourneyService、解释器和消息服务装配为生产开场服务。 |
| [src/capabilities/conversation/opening-conversation-service.test.ts](../src/capabilities/conversation/opening-conversation-service.test.ts) | 测试（对应模块边界） | 验证正常开场、重复 POST 复用、重开不再调用模型及不合资格拒绝。 |
| [src/capabilities/conversation/opening-conversation-service.ts](../src/capabilities/conversation/opening-conversation-service.ts) | 应用层/用例装配 | 开场资格判断，生成/复用固定 ID 的助手开场，防止重试重复调用或写入。 |
| [src/capabilities/conversation/prompts/workspace-conversation-prompt.test.ts](../src/capabilities/conversation/prompts/workspace-conversation-prompt.test.ts) | 测试（对应模块边界） | 验证模型提案、提供方核验、用户确认分离、不虚构计划能力，范围规则不变成固定话术，以及两种模式都写入回复语言规则。 |
| [src/capabilities/conversation/prompts/workspace-conversation-prompt.ts](../src/capabilities/conversation/prompts/workspace-conversation-prompt.ts) | 应用层/用例装配 | 聊天系统 prompt：用户决定、地点提案、推荐/规划边界、中国目的地范围（仅遇境外地点时说明）、回复语言和 opening 规则。 |
| [src/capabilities/conversation/prompts/reply-language-guidance.ts](../src/capabilities/conversation/prompts/reply-language-guidance.ts) | 应用层/用例装配 | 提示词里的语言名和回复语言规则：按用户这条消息的语言回复，分不清时用首页选择的语言（由模型判断），旅程名用首页语言；只管文字，不管 destinationEdit 地名怎么写。 |
| [src/capabilities/conversation/prompts/workspace-conversation-locale-rules.ts](../src/capabilities/conversation/prompts/workspace-conversation-locale-rules.ts) | 应用层/用例装配 | 聊天 prompt 里按语言分写的部分：地点修改规则与示例、推荐意图示例、天气反例；中文为调好的原文，英文用英文示例并要求把英文/拼音地名换成中文名交给高德。 |
| [src/capabilities/conversation/prompts/chinese-prompts-lock.test.ts](../src/capabilities/conversation/prompts/chinese-prompts-lock.test.ts) | 测试（对应模块边界） | 把中文界面的聊天/开场/草稿 prompt 与两份 JSON schema 和快照逐字比较；有意修改时用 UPDATE_PROMPT_SNAPSHOT=1 重写快照并重跑 harness 中文用例。 |
| [src/capabilities/conversation/prompts/chinese-prompts.snapshot.txt](../src/capabilities/conversation/prompts/chinese-prompts.snapshot.txt) | 测试数据 | 上面锁定测试的快照：1.0034 调好的中文 prompt 和 schema 原文。 |
| [src/capabilities/conversation/trip-message-service-instance.ts](../src/capabilities/conversation/trip-message-service-instance.ts) | 应用层/用例装配 | 装配 Postgres message repository 和 TripRepository 为生产消息服务。 |
| [src/capabilities/conversation/trip-message-service.test.ts](../src/capabilities/conversation/trip-message-service.test.ts) | 测试（对应模块边界） | 验证真实双边消息、候选 presentation、确认幂等和所有权保护。 |
| [src/capabilities/conversation/trip-message-service.ts](../src/capabilities/conversation/trip-message-service.ts) | 应用层/用例装配 | owner 检查后保存初始原话、开场、完整对话、选卡确认、推荐卡片消息（不存在时才写）、推荐卡照片写回（只改原本是推荐卡的消息的 presentation）及读取消息。 |
| [src/capabilities/conversation/turn-reply.test.ts](../src/capabilities/conversation/turn-reply.test.ts) | 测试（对应模块边界） | 验证地点 edit 正文：已加入、准备度只说一次、有卡或失败时省略模型 reply。 |
| [src/capabilities/conversation/turn-reply.ts](../src/capabilities/conversation/turn-reply.ts) | 应用层/用例装配 | 应用自己的句子（措辞取自调用方传入的 meri-replies）：地点 edit 的“已加入/候选/失败”正文（destinationEditReply，出卡或没找到时提示可在目的地「添加」里自己搜）、推荐引导语去问句（recommendationLeadIn）、已捕获字段/待补信息/准备度固定文案，准备度只在首次可规划时说；不代表规划执行。 |
| [src/capabilities/conversation/meri-replies.ts](../src/capabilities/conversation/meri-replies.ts) | 应用层/用例装配 | Meri 在代码里写的句子的中英两份（已加入/候选/没找到/搜索提示/准备度/选卡确认/推荐固定句），以及两种语言的句子连接、列表分隔和引号；按首页选择的语言取用，不判断用户输入的语言。 |
| [src/capabilities/conversation/workspace-conversation-context.test.ts](../src/capabilities/conversation/workspace-conversation-context.test.ts) | 测试（对应模块边界） | 验证空历史、城市/spot 待选卡上下文、助手合并和历史预算。 |
| [src/capabilities/conversation/workspace-conversation-context.ts](../src/capabilities/conversation/workspace-conversation-context.ts) | 应用层/用例装配 | 选最近 5 轮/6000 字符真实历史，合并连续助手消息，保留选卡确认上下文。 |
| [src/capabilities/conversation/workspace-conversation-interpreter.test.ts](../src/capabilities/conversation/workspace-conversation-interpreter.test.ts) | 测试（对应模块边界） | 验证修改提案、当前状态/历史输入、非法 JSON/输出及 opening 限制。 |
| [src/capabilities/conversation/workspace-conversation-interpreter.ts](../src/capabilities/conversation/workspace-conversation-interpreter.ts) | 应用层/用例装配 | Workspace/opening 的结构化调用与四项 JSON Schema，挽救模型输出并记录丢弃项，opening 禁止修改。 |
| [src/capabilities/conversation/workspace-turn-branch.test.ts](../src/capabilities/conversation/workspace-turn-branch.test.ts) | 测试（对应模块边界） | 验证 helper 的候选/推荐/修改/普通对话分类，不证明当前入口调用该 helper。 |
| [src/capabilities/conversation/workspace-turn-branch.ts](../src/capabilities/conversation/workspace-turn-branch.ts) | 应用层/用例装配 | 分支分类纯 helper；仍有测试，但实际 messages route 没调用它。 |

### 6.10 Destination 应用用例

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/destination/apply-destination-edit.ts](../src/capabilities/destination/apply-destination-edit.ts) | 应用层/用例装配 | none/add/set/remove 执行：用户原话中被精确匹配的地点直接追加（added），其余准备待选卡；唯一删除；报告部分失败。 |
| [src/capabilities/destination/destination-choice-flow.test.ts](../src/capabilities/destination/destination-choice-flow.test.ts) | 测试（对应模块边界） | 跨模块验证核验→候选→显式提交不提前写目的地，以及提交复核身份/spot 保留；自身城市前缀算精确并用原话作景点名，其他前缀出卡。 |
| [src/capabilities/destination/destination-recommendation-selection-route.test.ts](../src/capabilities/destination/destination-recommendation-selection-route.test.ts) | 测试（对应模块边界） | 验证只有保存的 offer 可提交、owner/ID 校验、提供方失败及选择接口状态边界。 |
| [src/capabilities/destination/destination-selection-reply.test.ts](../src/capabilities/destination/destination-selection-reply.test.ts) | 测试（对应模块边界） | 验证确认包含城市/spot、已知/近似字段不重复追问，只有省也可规划、旧文本需重新确认。 |
| [src/capabilities/destination/destination-selection-reply.ts](../src/capabilities/destination/destination-selection-reply.ts) | 应用层/用例装配 | 从保存前后的 TripState 构造只说新增地点的确认，首次可规划时附准备度和补充信息邀请，固定正文无 LLM 调用，措辞按首页选择的语言（meri-replies）。 |
| [src/capabilities/destination/destination-selection-v2.test.ts](../src/capabilities/destination/destination-selection-v2.test.ts) | 测试（对应模块边界） | 验证多省追加、旧 replace 冲突、已确认/过期卡、安全重试及不恢复已删除目的地。 |
| [src/capabilities/destination/location-service.test.ts](../src/capabilities/destination/location-service.test.ts) | 测试（对应模块边界） | 验证空表达不调用、原话查询、无结果和提供方异常归一化。 |
| [src/capabilities/destination/location-service.ts](../src/capabilities/destination/location-service.ts) | 应用层/用例装配 | 调用 LocationProvider、规范化错误并执行名称解析；同名商业 POI 干扰时最多补查一次“原词＋市”，要求行政字段佐证；保留原始候选供手动选择。 |
| [src/capabilities/destination/place-images.ts](../src/capabilities/destination/place-images.ts) | 应用层/用例装配 | 照片查询顺序（景点/县级市境内→地标→市的国家级景点；省级景点只给只有省的目的地）、卡片配图、同一照片只出现一次、沿用卡片照片的已选地点照片。 |
| [src/capabilities/destination/place-images.test.ts](../src/capabilities/destination/place-images.test.ts) | 测试（对应模块边界） | 验证查询顺序（市卡不退到省）、逐个兜底、卡片配图、照片去重和沿用对话照片。 |
| [src/capabilities/destination/destination-photos-route.test.ts](../src/capabilities/destination/destination-photos-route.test.ts) | 测试（对应模块边界） | 验证照片接口按当前地点返回、不共享缓存、not-found 与其他失败区分。 |
| [src/capabilities/destination/location-suggestion-service.test.ts](../src/capabilities/destination/location-suggestion-service.test.ts) | 测试（对应模块边界） | 验证 query 规则、完整建议列表及调用前拒绝非法输入。 |
| [src/capabilities/destination/location-suggestion-service.ts](../src/capabilities/destination/location-suggestion-service.ts) | 应用层/用例装配 | 输入建议用例，trim/长度校验，调用建议端口并转换错误。 |
| [src/capabilities/destination/planning-readiness-route.test.ts](../src/capabilities/destination/planning-readiness-route.test.ts) | 测试（对应模块边界） | 验证无 owner 不加载、读取当前权威状态、准备度只读及不调用地点研究。 |
| [src/capabilities/destination/resolve-destination-place.ts](../src/capabilities/destination/resolve-destination-place.ts) | 应用层/用例装配 | 将核验候选映射为 province/place/spot，保留不同 provider 身份及显示细节；同一偏好的多条记录视为一个地点，并给出 exact（namesSamePlace：原话＋行政/景区后缀，可带记录自身市/区县前缀；其他前缀不算）。 |
| [src/capabilities/destination/verified-destination-choice.ts](../src/capabilities/destination/verified-destination-choice.ts) | 应用层/用例装配 | 对持久化卡项按偏好 ID/旧 provider 身份重新验证；已核验省范围有专门处理。 |

### 6.11 Recommendation 应用用例

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/recommendation/destination-recommendation-context.ts](../src/capabilities/recommendation/destination-recommendation-context.ts) | 应用层/用例装配 | 从当前状态、推荐范围（within/elsewhere）和最多 10 条/6000 字符历史构造聊天触发（conversation）的推荐 context，带首页选择的语言（推荐固定句用它）。 |
| [src/capabilities/recommendation/destination-recommendation-generator.test.ts](../src/capabilities/recommendation/destination-recommendation-generator.test.ts) | 测试（对应模块边界） | 验证聊天触发的上下文、真实历史/展示卡、JSON/schema 校验、理由按首页语言（名称保持中文）及推荐生成错误。 |
| [src/capabilities/recommendation/destination-recommendation-generator.ts](../src/capabilities/recommendation/destination-recommendation-generator.ts) | 应用层/用例装配 | 推荐模型 JSON Schema、AI SDK 调用及领域校验，输出省/市/理由/配图地标，非法结果抛专用错误。 |
| [src/capabilities/recommendation/destination-recommendation-model-client.test.ts](../src/capabilities/recommendation/destination-recommendation-model-client.test.ts) | 测试（对应模块边界） | 验证显式按钮调用不伪造 user 消息，AI SDK 只发一次模型请求。 |
| [src/capabilities/recommendation/destination-recommendations-route.test.ts](../src/capabilities/recommendation/destination-recommendations-route.test.ts) | 测试（对应模块边界） | 验证推荐卡片接口：派生 ID、重复请求不重跑、对话或目的地变化后 409、错误请求与工作流失败不写入。 |
| [src/capabilities/recommendation/destination-recommendation-photos-route.test.ts](../src/capabilities/recommendation/destination-recommendation-photos-route.test.ts) | 测试（对应模块边界） | 验证照片流逐行返回并写回、无待查卡时空响应、保存失败仍发完、浏览器离开仍保存、owner/非推荐卡/坏 body 被拒。 |
| [src/capabilities/recommendation/destination-recommendation-use-case.test.ts](../src/capabilities/recommendation/destination-recommendation-use-case.test.ts) | 测试（对应模块边界） | 验证推荐范围判断（within/elsewhere/拒绝）、pending 请求还原、状态变化后不出卡及工作流失败传递。 |
| [src/capabilities/recommendation/destination-recommendation-use-case.ts](../src/capabilities/recommendation/destination-recommendation-use-case.ts) | 应用层/用例装配 | 按写入后状态判断推荐范围；从保存的对话还原 pending 请求；状态仍允许时运行工作流。 |
| [src/capabilities/recommendation/destination-recommendation-workflow.test.ts](../src/capabilities/recommendation/destination-recommendation-workflow.test.ts) | 测试（对应模块边界） | 验证省份/顺序保留、搜索失败降级、已定省过滤、空结果固定正文及卡片带地标不带照片。 |
| [src/capabilities/recommendation/recommendation-photos.ts](../src/capabilities/recommendation/recommendation-photos.ts) | 应用层/用例装配 | 为未查过照片的推荐卡按地标并行查图，到一张报一张，同批照片先到先得不重复，返回补好的 presentation。 |
| [src/capabilities/recommendation/recommendation-photos.test.ts](../src/capabilities/recommendation/recommendation-photos.test.ts) | 测试（对应模块边界） | 验证按地标查图与逐张回报、已有答案或无省的卡不再查、同一照片不出现在两张卡上。 |
| [src/capabilities/recommendation/destination-recommendation-workflow.ts](../src/capabilities/recommendation/destination-recommendation-workflow.ts) | 应用层/用例装配 | Discovery Search→模型生成→省份过滤（within 限已定省，elsewhere 排除已保存省）→卡项 ID（带配图用的地标，不查照片）的确定性流程；搜索故障降级，无排序/访问检查。 |
| [src/capabilities/recommendation/prompts/destination-recommendation-prompt.ts](../src/capabilities/recommendation/prompts/destination-recommendation-prompt.ts) | 应用层/用例装配 | 受限省市推荐 prompt，含聊天触发说明、真实上下文和未核验搜索启发；理由用首页语言写，省/市/地标名保持中文。 |

### 6.12 外部集成：身份、模型、地图、搜索和日志

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/platform/identity/guest-identity.test.ts](../src/platform/identity/guest-identity.test.ts) | 测试（对应模块边界） | 验证既有 UUID 复用、缺失/非法 cookie 创建及 cookie 配置。 |
| [src/platform/identity/guest-identity.ts](../src/platform/identity/guest-identity.ts) | 基础设施端口/适配器 | 读取/验证 meri_guest_id cookie，必要时生成访客 UUID 和安全 cookie 配置。 |
| [src/platform/locale/locale-preference.ts](../src/platform/locale/locale-preference.ts) | 基础设施端口/适配器 | `meri_locale` cookie 名、按 Accept-Language 排序取中/英、读取偏好与写 cookie 的字符串；无服务端依赖，切换按钮共用。 |
| [src/platform/locale/locale-preference.test.ts](../src/platform/locale/locale-preference.test.ts) | 测试（对应模块边界） | 验证浏览器语言排序与权重、cookie 优先且坏值被忽略、cookie 字符串。 |
| [src/platform/locale/request-locale.ts](../src/platform/locale/request-locale.ts) | 基础设施端口/适配器 | 服务端从当前请求的 cookies/headers 取语言。 |
| [src/platform/llm/ai-sdk-kimi-client.test.ts](../src/platform/llm/ai-sdk-kimi-client.test.ts) | 测试（对应模块边界） | mock 验证 schema/历史转发、旧新 SDK 契约、非法/截断输出、超时/HTTP 错误及配置校验。 |
| [src/platform/llm/ai-sdk-kimi-client.ts](../src/platform/llm/ai-sdk-kimi-client.ts) | 基础设施端口/适配器 | Kimi 的 Vercel AI SDK 适配器，结构化输出、finish reason/usage 归一化、60 秒超时、零自动重试和日志。 |
| [src/platform/llm/kimi-client.ts](../src/platform/llm/kimi-client.ts) | 基础设施端口/适配器 | StructuredOutputModelClient 端口及通用模型错误，同时保留旧 OpenAI SDK Kimi 实现；当前应用入口默认 AI SDK 客户端。 |
| [src/platform/location-provider/amap-input-tips-provider.test.ts](../src/platform/location-provider/amap-input-tips-provider.test.ts) | 测试（对应模块边界） | mock 验证 query 编码、完整 tips、空/畸形响应及错误安全边界。 |
| [src/platform/location-provider/amap-input-tips-provider.ts](../src/platform/location-provider/amap-input-tips-provider.ts) | 基础设施端口/适配器 | 高德 InputTips HTTP 适配（经共用节流器），规范化输入建议并区分空结果和故障。 |
| [src/platform/location-provider/amap-location-provider.test.ts](../src/platform/location-provider/amap-location-provider.test.ts) | 测试（对应模块边界） | mock 验证中文 query 编码、POI/行政层级、坐标和提供方错误归一化。 |
| [src/platform/location-provider/amap-location-provider.ts](../src/platform/location-provider/amap-location-provider.ts) | 基础设施端口/适配器 | 高德关键词 POI HTTP 适配（经共用节流器），编码 query、行政信息/坐标规范化、按高德类别码标出景点（风景名胜除城市广场、博物馆）及错误控制；不取照片（照片在 place-photos）。 |
| [src/platform/location-provider/location-provider.ts](../src/platform/location-provider/location-provider.ts) | 基础设施端口/适配器 | 地点搜索端口与 success/failure 规范化结果，隔离高德响应格式。 |
| [src/platform/location-provider/location-suggestion-provider.ts](../src/platform/location-provider/location-suggestion-provider.ts) | 基础设施端口/适配器 | 输入建议端口及规范化错误类型。 |
| [src/platform/observability/logger.ts](../src/platform/observability/logger.ts) | 基础设施端口/适配器 | 共享 Pino logger 和事件名称，按环境配置日志级别/开发格式。 |
| [src/platform/observability/serialize-error.test.ts](../src/platform/observability/serialize-error.test.ts) | 测试（对应模块边界） | 验证错误正文、堆栈和 cause 中凭据脱敏。 |
| [src/platform/observability/serialize-error.ts](../src/platform/observability/serialize-error.ts) | 基础设施端口/适配器 | 序列化 message/stack/cause 等错误信息并移除提供方凭据。 |
| [src/platform/search/bocha-discovery-search.test.ts](../src/platform/search/bocha-discovery-search.test.ts) | 测试（对应模块边界） | mock 验证搜索请求、结果字段/数量、摘要回退、故障转换及缺密钥。 |
| [src/platform/search/bocha-discovery-search.ts](../src/platform/search/bocha-discovery-search.ts) | 基础设施端口/适配器 | 将 Bocha 网页规范化为最多 8 条 DiscoverySearchResult，构造环境适配器。 |
| [src/platform/amap/amap-fetch.ts](../src/platform/amap/amap-fetch.ts) | 基础设施/适配器 | 高德请求排队：进程内共用一个队列，请求开始时间相隔 ≥350ms；超时从请求真正发出时计算（排队不占超时）；识别 HTTP 200 里的限流 infocode 后整个队列暂停 1 秒，被拒请求排到队首重试，最多 3 次。 |
| [src/platform/amap/amap-fetch.test.ts](../src/platform/amap/amap-fetch.test.ts) | 测试（对应模块边界） | 验证排队顺序与间隔、暂停挡住已在排队的请求、重试排队首且最多 3 次、超时从发出时起算、普通失败不重试。 |
| [src/platform/place-photos/place-photo-provider.ts](../src/platform/place-photos/place-photo-provider.ts) | 基础设施/端口 | 照片查询（按名称或按区域国家级景点）接口与允许的照片主机列表。 |
| [src/platform/place-photos/amap-place-photo-provider.ts](../src/platform/place-photos/amap-place-photo-provider.ts) | 基础设施/适配器 | 高德 v5 搜索取照片：经共用节流器请求、http 升级 https、主机白名单、只缓存真实答案的进程内 7 天缓存（PlacePhotoMemory）、失败返回 null 并记 infocode。 |
| [src/platform/place-photos/amap-place-photo-provider.test.ts](../src/platform/place-photos/amap-place-photo-provider.test.ts) | 测试（对应模块边界） | 验证查询参数、https 升级、主机过滤、各种失败，以及只缓存真实答案、过期重查。 |
| [src/platform/search/bocha-web-search.test.ts](../src/platform/search/bocha-web-search.test.ts) | 测试（对应模块边界） | mock 验证 POST/envelope、webPages/images 区段、缺密钥不请求及错误脱敏。 |
| [src/platform/search/bocha-web-search.ts](../src/platform/search/bocha-web-search.ts) | 基础设施端口/适配器 | 共享 Bocha Web Search HTTP 请求、响应 envelope 检查、日期转换、超时/网络/API 错误脱敏。 |
| [src/platform/search/discovery-search.ts](../src/platform/search/discovery-search.ts) | 基础设施端口/适配器 | DiscoverySearch 端口、旅程搜索 query、失败降级空上下文和规范化错误。 |

### 6.13 持久化端口、适配器与数据库 schema

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/platform/persistence/database/db.ts](../src/platform/persistence/database/db.ts) | 数据库基础设施 | 检查 DATABASE_URL，装配 Neon HTTP 客户端与 Drizzle/schema。 |
| [src/platform/persistence/database/schema/index.ts](../src/platform/persistence/database/schema/index.ts) | 数据库基础设施 | 导出当前三张表的 schema，不包含旧 user actions 表。 |
| [src/platform/persistence/database/schema/trip-messages.ts](../src/platform/persistence/database/schema/trip-messages.ts) | 数据库基础设施 | trip_messages 表和角色 enum，正文/presentation/时间戳及 Trip 外键级联。 |
| [src/platform/persistence/database/schema/trip-states.ts](../src/platform/persistence/database/schema/trip-states.ts) | 数据库基础设施 | trip_states 表，以 Trip ID 为主键，JSONB 保存状态，删除 Trip 时级联。 |
| [src/platform/persistence/database/schema/trips.ts](../src/platform/persistence/database/schema/trips.ts) | 数据库基础设施 | trips 表及 idea/planning enum，保存 ID/owner/status/时间戳。 |
| [src/platform/persistence/in-memory/in-memory-trip-message-repository.test.ts](../src/platform/persistence/in-memory/in-memory-trip-message-repository.test.ts) | 测试（对应模块边界） | 验证完整对话顺序、独立原话/助手消息及重复身份处理。 |
| [src/platform/persistence/in-memory/in-memory-trip-message-repository.ts](../src/platform/persistence/in-memory/in-memory-trip-message-repository.ts) | 基础设施端口/适配器 | 内存消息仓库，存取真实 turn、按时间读取、稳定 ID 去重及助手消息 presentation 替换。 |
| [src/platform/persistence/in-memory/in-memory-trip-repository.test.ts](../src/platform/persistence/in-memory/in-memory-trip-repository.test.ts) | 测试（对应模块边界） | 验证内存创建/查询和 owner 可见性。 |
| [src/platform/persistence/in-memory/in-memory-trip-repository.ts](../src/platform/persistence/in-memory/in-memory-trip-repository.ts) | 基础设施端口/适配器 | 内存 TripRepository，测试中保留 owner 读写隔离。 |
| [src/platform/persistence/in-memory/in-memory-trip-state-repository.test.ts](../src/platform/persistence/in-memory/in-memory-trip-state-repository.test.ts) | 测试（对应模块边界） | 验证创建/读取、替换更新及内存比较更新。 |
| [src/platform/persistence/in-memory/in-memory-trip-state-repository.ts](../src/platform/persistence/in-memory/in-memory-trip-state-repository.ts) | 基础设施端口/适配器 | 内存 TripStateRepository，实现存取和 CAS，供应用测试模拟状态冲突。 |
| [src/platform/persistence/journey-summary-repository.ts](../src/platform/persistence/journey-summary-repository.ts) | 持久化端口/读模型 | JourneySummary 读模型和按 owner 列表接口，不作为可变状态仓库。 |
| [src/platform/persistence/postgres/postgres-journey-summary-repository.test.ts](../src/platform/persistence/postgres/postgres-journey-summary-repository.test.ts) | 测试（对应模块边界） | mock 验证权威状态投影、owner 过滤、缺状态及 certainty 保留。 |
| [src/platform/persistence/postgres/postgres-journey-summary-repository.ts](../src/platform/persistence/postgres/postgres-journey-summary-repository.ts) | 基础设施端口/适配器 | 关联 Trip 与当前状态，按 owner 查询并投影列表摘要，不使用旧 Trip 字段。 |
| [src/platform/persistence/postgres/postgres-trip-message-repository.test.ts](../src/platform/persistence/postgres/postgres-trip-message-repository.test.ts) | 测试（对应模块边界） | mock 验证完整 turn 单次插入、原话/助手 presentation、时间顺序和重复 ID 处理。 |
| [src/platform/persistence/postgres/postgres-trip-message-repository.ts](../src/platform/persistence/postgres/postgres-trip-message-repository.ts) | 基础设施端口/适配器 | PostgreSQL 消息插入/读取，完整双边 turn 单次 insert，稳定 ID 重试及 presentation 校验；按 id+trip+assistant 替换 presentation（推荐卡照片，唯一的消息更新）。 |
| [src/platform/persistence/postgres/postgres-trip-repository.test.ts](../src/platform/persistence/postgres/postgres-trip-repository.test.ts) | 测试（对应模块边界） | mock 数据库验证字段映射、owner 条件、列表/删除及错误 cause。 |
| [src/platform/persistence/postgres/postgres-trip-repository.ts](../src/platform/persistence/postgres/postgres-trip-repository.ts) | 基础设施端口/适配器 | PostgreSQL Trip 增查删适配，显式字段映射、owner 过滤和错误包装。 |
| [src/platform/persistence/postgres/postgres-trip-state-repository.test.ts](../src/platform/persistence/postgres/postgres-trip-state-repository.test.ts) | 测试（对应模块边界） | mock 数据库验证状态语义、旧数据读取、JSONB CAS 条件/冲突及异常。 |
| [src/platform/persistence/postgres/postgres-trip-state-repository.ts](../src/platform/persistence/postgres/postgres-trip-state-repository.ts) | 基础设施端口/适配器 | 状态 JSONB 存取、领域读取校验/兼容，原始 JSONB 条件 CAS 与错误包装。 |
| [src/platform/persistence/trip-message-repository.ts](../src/platform/persistence/trip-message-repository.ts) | 持久化端口/读模型 | 消息存储端口，定义完整 turn、单消息、列表及助手消息 presentation 替换能力。 |
| [src/platform/persistence/trip-repository.ts](../src/platform/persistence/trip-repository.ts) | 持久化端口/读模型 | Trip 存储端口，定义创建、owner-scoped 查询/删除等，不写具体 SQL。 |
| [src/platform/persistence/trip-state-repository.ts](../src/platform/persistence/trip-state-repository.ts) | 持久化端口/读模型 | TripState 存储端口，包含读取/更新及可选 compareAndUpdate；生产实现使用 CAS。 |

### 6.14 数据库迁移和元数据

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [drizzle/0000_initial_trips.sql](../drizzle/0000_initial_trips.sql) | 数据库演进/工具元数据 | 历史初始 Trip 表与生命周期 enum；旧旅程字段后续迁移移除。 |
| [drizzle/0001_support_incomplete_trip_ideas.sql](../drizzle/0001_support_incomplete_trip_ideas.sql) | 数据库演进/工具元数据 | 历史迁移：放宽 destination/日期非空限制并添加 origin，支持不完整想法。 |
| [drizzle/0002_fearless_mach_iv.sql](../drizzle/0002_fearless_mach_iv.sql) | 数据库演进/工具元数据 | 创建 trip_states JSONB 表与级联外键，建立独立权威状态。 |
| [drizzle/0003_misty_maginty.sql](../drizzle/0003_misty_maginty.sql) | 数据库演进/工具元数据 | 增加 owner_guest_id，为历史行回填访客 UUID 并设为非空。 |
| [drizzle/0004_persist_trip_messages.sql](../drizzle/0004_persist_trip_messages.sql) | 数据库演进/工具元数据 | 创建 trip_messages、角色 enum 和 Trip 级联外键。 |
| [drizzle/0005_remove_legacy_trip_state.sql](../drizzle/0005_remove_legacy_trip_state.sql) | 数据库演进/工具元数据 | 删除 Trip 根表旧 name/origin/destination/日期列及日期约束，避免双重状态来源。 |
| [drizzle/0006_backfill_default_journey_names.sql](../drizzle/0006_backfill_default_journey_names.sql) | 数据库演进/工具元数据 | 仅对缺 name 且旧 destination.value 已知的状态回填系统默认旅程名。 |
| [drizzle/0007_trip_user_actions.sql](../drizzle/0007_trip_user_actions.sql) | 数据库演进/工具元数据 | 历史迁移：创建显式推荐 action 表和外键；不是当前 schema 的实体。 |
| [drizzle/0008_trip_message_presentation.sql](../drizzle/0008_trip_message_presentation.sql) | 数据库演进/工具元数据 | 为助手消息增加 JSONB presentation，用于刷新恢复卡片。 |
| [drizzle/0009_drop_trip_user_actions.sql](../drizzle/0009_drop_trip_user_actions.sql) | 数据库演进/工具元数据 | 定义删除旧 trip_user_actions 表，当前代码以请求入口标记推荐来源；未在本次执行迁移。 |
| [drizzle/meta/0000_snapshot.json](../drizzle/meta/0000_snapshot.json) | 数据库演进/工具元数据 | 第 0 次迁移生成的历史 schema 快照（public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0001_snapshot.json](../drizzle/meta/0001_snapshot.json) | 数据库演进/工具元数据 | 第 1 次迁移生成的历史 schema 快照（public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0002_snapshot.json](../drizzle/meta/0002_snapshot.json) | 数据库演进/工具元数据 | 第 2 次迁移生成的历史 schema 快照（public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0003_snapshot.json](../drizzle/meta/0003_snapshot.json) | 数据库演进/工具元数据 | 第 3 次迁移生成的历史 schema 快照（public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0004_snapshot.json](../drizzle/meta/0004_snapshot.json) | 数据库演进/工具元数据 | 第 4 次迁移生成的历史 schema 快照（public.trip_messages、public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0005_snapshot.json](../drizzle/meta/0005_snapshot.json) | 数据库演进/工具元数据 | 第 5 次迁移生成的历史 schema 快照（public.trip_messages、public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/0006_snapshot.json](../drizzle/meta/0006_snapshot.json) | 数据库演进/工具元数据 | 第 6 次迁移生成的历史 schema 快照（public.trip_messages、public.trip_states、public.trips），用于 Drizzle 差异计算，不是当前在线数据库状态。 |
| [drizzle/meta/_journal.json](../drizzle/meta/_journal.json) | 数据库演进/工具元数据 | Drizzle 迁移顺序记录，包含 0000–0009；不等于某环境已全部执行。 |

### 6.15 人工验证脚本

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [scripts/verify-destination-conversation-turns.ts](../scripts/verify-destination-conversation-turns.ts) | 开发验证工具 | 用多轮样例人工检查真实模型的地点/偏好解释、推荐意图、中国范围、错别字保留、天气/准备度/单问题规则、已有状态保护及回复语言和英文地名翻译（20–27 为英文界面或跨语言输入），需要模型配置。 |
| [scripts/verify-location-resolve.ts](../scripts/verify-location-resolve.ts) | 开发验证工具 | 人工验证真实高德查询及 LocationService/层级解析结果，不是自动单元测试。 |
| [scripts/verify-workspace-location-tool.ts](../scripts/verify-workspace-location-tool.ts) | 开发验证工具 | 人工调用真实 Workspace 解释器，检查地点意图结构；文件名保留旧 tool 命名，当前不是开放式工具 Agent。 |

### 6.16 网站静态资源

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [public/backgrounds/home-v2-landscape.png](../public/backgrounds/home-v2-landscape.png) | 展示资源 | 当前首页 landscape 背景，由 meri-app-shell.module.css 引用。 |
| [public/backgrounds/meri-world-desktop.png](../public/backgrounds/meri-world-desktop.png) | 展示资源 | 当前 Journey 列表背景，由 trips.module.css 引用。 |
| [public/backgrounds/meri-world-mobile.png](../public/backgrounds/meri-world-mobile.png) | 展示资源 | 保留的移动场景背景素材，当前源码没有直接引用。 |
| [public/backgrounds/trip-workspace-desktop.png](../public/backgrounds/trip-workspace-desktop.png) | 展示资源 | 保留的旧 Workspace 桌面背景，当前主样式采用 workspace-alpine-day。 |
| [public/backgrounds/workspace-alpine-day.png](../public/backgrounds/workspace-alpine-day.png) | 展示资源 | 当前 Workspace 背景、旅程缩略图和右侧封面共用的山景图。 |
| [public/brand/meri-app-icon-1024.png](../public/brand/meri-app-icon-1024.png) | 展示资源 | layout/manifest 使用的应用安装图标。 |
| [public/brand/meri-favicon.svg](../public/brand/meri-favicon.svg) | 展示资源 | layout 使用的网站 favicon。 |
| [public/brand/meri-home-mountain.png](../public/brand/meri-home-mountain.png) | 展示资源 | 首页和 Workspace header 使用的山形品牌图。 |
| [public/brand/meri-lockup.svg](../public/brand/meri-lockup.svg) | 展示资源 | Workspace 使用的组合品牌标识。 |
| [public/brand/meri-mark.svg](../public/brand/meri-mark.svg) | 展示资源 | Journey 列表等处使用的独立图形标识。 |
| [public/brand/meri-wordmark.svg](../public/brand/meri-wordmark.svg) | 展示资源 | Journey 列表/缺状态页面使用的文字标识。 |
| [public/companion/bear/bear-sprites.json](../public/companion/bear/bear-sprites.json) | 展示资源 | 小熊精灵图帧清单：帧尺寸、每个动画所在行、帧数和每帧毫秒；由生成脚本写出。 |
| [public/companion/bear/bear-sprites.png](../public/companion/bear/bear-sprites.png) | 展示资源 | 小熊营地小桌精灵图：9 个动画、42 帧，1 倍尺寸透明背景；由生成脚本写出。 |
| [public/companion/home-v2-companion.png](../public/companion/home-v2-companion.png) | 展示资源 | 首页、聊天头像和 Workspace Companion 使用的角色图。 |
| [public/metadata.json](../public/metadata.json) | 展示资源 | 素材导出的角色信息、方向和原始路径元数据，不是当前业务配置或用户数据。 |

### 6.17 设计和素材制作

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [assets/brand/meri-favicon-preview.png](../assets/brand/meri-favicon-preview.png) | 设计/素材制作 | favicon 设计预览，区别于 public 中上线 SVG。 |
| [assets/brand/meri-lockup-preview.png](../assets/brand/meri-lockup-preview.png) | 设计/素材制作 | 组合品牌标识的设计预览。 |
| [assets/brand/meri-mark-preview.png](../assets/brand/meri-mark-preview.png) | 设计/素材制作 | 独立品牌图形的设计预览。 |
| [assets/brand/meri-wordmark-preview.png](../assets/brand/meri-wordmark-preview.png) | 设计/素材制作 | 品牌文字标识的设计预览。 |
| [assets/companion/bear/generate_bear_sprites.py](../assets/companion/bear/generate_bear_sprites.py) | 设计/素材制作 | 用 Pillow 从 home-v2-companion.png 生成 64px 底图并合成全部小熊帧，写出 public/companion/bear 下的精灵图和帧清单；可加 --preview 输出预览。不是运行时代码。 |
| [assets/companion/Logo.png](../assets/companion/Logo.png) | 设计/素材制作 | 角色/品牌制作参考图片，不是业务逻辑。 |
| [assets/companion/LogoSVG-framework.png](../assets/companion/LogoSVG-framework.png) | 设计/素材制作 | 品牌图形制作参考，不是运行时组件。 |
| [assets/companion/Meri.png](../assets/companion/Meri.png) | 设计/素材制作 | Meri 角色制作参考原图。 |
| [assets/design/visual-media-v1-prompts.json](../assets/design/visual-media-v1-prompts.json) | 设计/素材制作 | 两张视觉效果图的完整生成提示词、输出文件与讨论状态；使用内置图像生成工具。 |
| [assets/design/home-visual-media-v2.png](../assets/design/home-visual-media-v2.png) | 设计/素材制作 | 当前首页截图引导的局部营地设计稿；保留最新背景和布局，非像素级实现。 |
| [assets/design/workspace-visual-media-v2.png](../assets/design/workspace-visual-media-v2.png) | 设计/素材制作 | 当前 Workspace 截图引导的纸上营地设计稿；保留实际页面状态，未接入 3D。 |
| [assets/design/visual-media-v2-prompts.json](../assets/design/visual-media-v2-prompts.json) | 设计/素材制作 | 第二轮截图引导生成的完整提示词、参考素材与未批准状态。 |

### 6.18 历史目录占位文件

| 文件地址 | 层/类别 | 做什么 |
| --- | --- | --- |
| [src/capabilities/.gitkeep](../src/capabilities/.gitkeep) | 工程占位 | 历史目录占位文件；该目录已有实际代码，占位文件不参与运行。 |
| [src/components/.gitkeep](../src/components/.gitkeep) | 工程占位 | 历史目录占位文件；该目录已有实际代码，占位文件不参与运行。 |
| [src/domain/.gitkeep](../src/domain/.gitkeep) | 工程占位 | 历史目录占位文件；该目录已有实际代码，占位文件不参与运行。 |

## 7. 维护与核对

更新时用 `git ls-files` 和 `rg --files --hidden -g '!node_modules' -g '!.git' -g '!.next'` 核对受维护文件与非忽略新文件。新增文件应有准确职责，删除后同时修复索引和 Markdown 链接。迁移只记录 SQL 意图；执行状态应单独检查，不靠文件名称判断。

向用户讲解时先讲第 2–4 节，再选一条第 5 节的业务链路深入源码。逐文件索引用来回答“这段规则在哪里、由谁调用、谁负责保存”，不需要逐条背诵文件名。业务和错误细节继续以 USER_FLOW_CURRENT 的完整章节展开。
