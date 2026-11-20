# Higress 接入合同与实施进度

总体方向见 [Console 与 Higress 总体架构](console-higress.md)。本合同将迁移拆成可运行、可回归的代码变更。

跟踪：[design issue #144](https://github.com/modelsphere/console/issues/144)。当前已有 P1 接入代码与本地测试，尚未在 Higress/vCluster 验收或切流；操作路径见 [开发接入与验收](../higress-operations.md)。

## 首批边界

```text
SDK /v1/chat/completions ───────────────▶ Higress ─▶ OpenAI-compatible Service
Playground /api/llm/v1/chat/completions ─▶ Higress ─▶ 同一 Service
                                           │
                                           ▼
                                    console --role=gateway-auth
                                    /authorize/<原始路径>
                                           │
                                           ▼
                                    APIKey / User / IAM 缓存
管理请求 ─▶ Console（保留 Key CRUD；不挂载旧生成代理）
```

| 合同 | 首批实现 |
| --- | --- |
| `higress.enabled` | 关闭 Console 的 SDK 与所选模型后端代理；Key 管理仍可用 |
| `higress.models` | 此入口允许的公开模型名，不能为空；鉴权与目录使用同一清单 |
| `higress.route` | 此入口的部署路由名；客户端 route 提示不匹配时拒绝 |
| `higress.sessionOrigin` | Playground 的精确外部 origin；Cookie POST 必须匹配 Origin |
| `--role=gateway-auth` | 独立进程，仅加载鉴权缓存与令牌验证，不启动生成代理、资金事务或 SPA |
| SDK 凭据 | 仅接受 Bearer API Key；复用摘要和旧格式验证，必须绑定 canonical UID |
| session 凭据 | Bearer 会话或 token Cookie；重新绑定当前用户、检查初始密码与 backend RBAC；不生成 API Key |
| 授权请求 | 官方 ext-auth 的 envoy 模式；原始方法、路径和完整 JSON body；默认拒绝未知路径 |
| 成功响应头 | 完整覆盖 principal UID、user、source、API Key ID、model、wallet revision；session 的 Key ID 为空 |
| 错误 | 401 凭据、403 权限、402 钱包、400 请求、413 body、503 依赖；OpenAI 错误格式 |
| 模型目录 | 独立鉴权服务返回授权后的 `/v1/models`、`/api/llm/v1/models` 和 `/api/llm/routes` |
| 请求范围 | Chat Completions 与模型目录；不隐式开放 files、batches、其他协议 |
| 上游 | 首批一个同命名空间、无需 Provider Key 的 OpenAI-compatible Service；不是经过旧 Gateway 的地址 |
| Helm | 现有 Console Chart 的可选 Higress 资源；官方 Higress 独立 release，不内置自研代理 |

## 安全与兼容

- 保留原默认部署；只有显式开启 Higress 的新入口才关闭旧推理代理。
- 首批禁止 `billing.enabled` 与 `higress.enabled` 同开：新计量输入尚未通过账务验收，不能让付费请求绕过计量。
- 不切换现有付费安装，不卸载旧 StatefulSet，不删除 journal、Key 或历史账务。
- auth.disabled 不能与 Higress 同开；独立授权服务不接受匿名管理员模式。
- SDK 不接受会话，session 不接受 Key；不信任客户端 X-Remote-* 或内部身份头。
- Higress ext-auth 仅放行服务返回的可信身份头；上游路由移除原始 Authorization、Cookie、X-Remote-* 等入口信息。
- Chart 引入专用只读鉴权 ServiceAccount，通过声明式 RBAC 读取 APIKey、User、WalletAdmission、IAM role/binding；启动时只读指定 Key Secret 的 authority marker，未完成 CRD 激活则拒绝启动，不由鉴权进程切换权威源。
- 首批不开放跨域 Cookie 推理，不接受跨站 Origin，不向上游发送用户凭据。
- 不将生成请求镜像到两条链路，不在新链路启用自动生成重试。

## 版本与验收

- 核对官方 Higress `v2.2.6` 的 Ingress annotations、WasmPlugin schema 与 ext-auth 文档；部署必须显式给出经验证的 ext-auth OCI digest，不使用 floating latest。
- 单元/集成测试覆盖 API Key、session、模型限制、失活/重建用户、钱包、伪造头、CSRF、body 上限和旧代理隔离。
- Helm 测试覆盖授权服务、精确路由、插件失败关闭、RBAC 和不允许的计费组合。
- 真正的 Higress JSON/SSE、取消、插件加载与路由生效需要开发 vCluster 验收；本地 HTTP 测试不替代网关验收。

## 后续批次

| 批次 | 内容 | 切流门槛 |
| --- | --- | --- |
| P1 | 独立授权服务、Higress 路由、管理面解耦 | 免费受控上游端到端通过 |
| P2 | Provider/模型资源协调、可信用量采集、持久重放、影子对账 | 单请求与故障恢复对账通过 |
| P3 | wallet/cache 新鲜度与积压门禁、正式计费单写切换 | 计费/禁用/充值/故障验收通过 |
| P4 | 排空旧请求/队列/journal，退役旧代理实现 | 对账完成，保留历史资金事实 |

不采用：Higress 后串联旧推理 Router；修改现有 Key 为明文；复制 Global 私有插件；先切付费流量再补计量。
