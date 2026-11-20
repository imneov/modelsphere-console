# Higress 开发接入与验收

当前代码提供 P1 非计费入口；付费安装保持原链路。设计与后续批次见 [接入合同](architecture/higress-integration.md)。

## 前置条件

| 项目 | 要求 |
| --- | --- |
| 环境 | 独立开发 vCluster 或隔离的非计费安装；不要覆盖当前计费 release |
| 网关 | 独立安装官方 Higress `2.2.6`，确认 IngressClass、WasmPlugin CRD 和控制面 Ready |
| Console 镜像 | 必须包含本批变更；通过 GitHub 构建发布，不使用旧 `0.2.1` 镜像假装接入完成 |
| 上游 | 同命名空间直接模型 Service，兼容 OpenAI Chat Completions；首批不支持 Provider Key |
| 用户 | 已存在且有效的 User，Key 使用 CRD authority；旧 Secret Key 先完成显式迁移 |
| 浏览器 | 同一 host 分流管理、SDK 与 Playground；配置精确 sessionOrigin |
| 网络 | Higress 能调用授权 Service 和模型 Service；授权进程能 list/watch 对应 CRD |

2026-11-20 查询官方 `v2.2.6` 源码中 ext-auth 的 `VERSION` 为 `2.0.4`；官方 registry 的该 tag 返回以下 manifest digest。这里只记录选型证据，不代表已完成运行时验收：

```text
oci://higress-registry.cn-hangzhou.cr.aliyuncs.com/plugins/ext-auth@sha256:74487a218f36d3947f47b42a6fbb1ef8c1fa9efa07596acf416a69b93a787e68
```

## 渲染与安装顺序

```text
官方 Higress 独立 release
  -> CRD / IngressClass discovery
  -> GitHub 构建 Console 镜像
  -> 复制 values-higress.example.yaml 并配置环境值
  -> helm template / diff
  -> 安装隔离的非计费 Console release
  -> 授权缓存 Ready / 插件加载成功
  -> 实际 JSON / SSE / 拒绝路径拨测
```

示例 values：`helm/console/values-higress.example.yaml`。必须提供：

- `image.repository`、`image.tag`：包含变更的 GitHub 构建镜像。
- `higress.host`、`higress.sessionOrigin`、`higress.tlsSecretName`：环境域名与已有 TLS Secret；隔离 HTTP 测试可以不设 TLS。
- `higress.models`、`higress.route`、`higress.upstream.*`：当前入口的模型与直接上游。
- `higress.extAuth.image`：经过核验的不可变插件引用。
- `router.keySource: crd`；`billing.enabled: false`；不要通过关闭现有计费 release 的 billing 来满足该条件。

授权服务与 Console 使用同一镜像，进程入口是 `console --role=gateway-auth`。它不启动 SPA、生成代理、PG 或 Redis 连接。Chart 声明独立只读 ServiceAccount、Deployment、Service 与 PDB。

配置包含 legacy Key Secret 时，授权进程启动先只读检查 CRD authority 已激活；Console 管理进程负责已有迁移流程。激活未完成时授权进程退出并等待重启，不使用仍处于 staging 的 Key，也不自行写入 authority marker。

## 路径与行为

| 外部路径 | 处理方 | 凭据 |
| --- | --- | --- |
| `/v1/chat/completions` | Higress -> 模型 Service | Bearer API Key |
| `/api/llm/v1/chat/completions` | Higress rewrite -> `/v1/chat/completions` -> 模型 Service | Console session |
| `/v1/models` | 授权服务，返回 Key 可用模型 | Bearer API Key |
| `/api/llm/v1/models`、`/api/llm/routes` | 授权服务，返回用户可用目录 | Console session |
| 其他管理路径 | Console | 原有登录与 RBAC |

- SDK 与 Playground 的生成路由为 Exact，不自动开放其他协议。
- 授权请求为 `/authorize/<原始路径>`，方法与 body 保持原样；未知路径不放行。
- 直接请求 Console Service 的旧推理路径返回 503，不重定向、不代理、不降级到旧网关。
- `GET /api/llm/route-options` 返回 404，表示没有旧网关的 directive catalog，保留前端的可选能力回退。
- 授权依赖或 Wasm 插件失败关闭；不配置失败匿名放行。
- Cookie 生成请求必须携带精确匹配的 Origin；session 不生成或冒充 SDK API Key。
- 生成路由移除用户 Authorization/Cookie，且关闭自动生成重试。

## 开发 vCluster 验收

| 检查 | 通过标准 |
| --- | --- |
| 控制面 | 所有配置被接受；插件实际加载，不能只看资源创建成功 |
| 身份 | 摘要 Key、旧格式迁移 Key、session 均绑定正确 UID；伪造身份头被覆盖 |
| 拒绝 | 停用/过期/失活/重建用户/错模型均拒绝；授权服务停止后不穿透 |
| 会话 | 初始密码未修改不能推理；Cookie 无 Origin/错误 Origin 拒绝；普通用户按实际 RBAC 判断 |
| JSON | 网关直达模型；上游没有用户凭据，返回正确 JSON |
| SSE | 增量到达，不等待完整响应；模型最终 usage 保留；验证取消与上游断流 |
| 隔离 | SDK/session 生成请求不进入 Console 旧代理；管理 API、Key CRUD 正常 |
| 计费保护 | Helm 和程序配置均拒绝付费模式；旧计费 release 与历史数据未变 |

本地自动化覆盖领域鉴权、真实 CRD informer 适配、代理隔离及 Helm 契约；真实 Higress 的插件执行顺序、rewrite、JSON/SSE 与取消须在 vCluster 单独验收。P2/P3 完成之前不切付费流量。
