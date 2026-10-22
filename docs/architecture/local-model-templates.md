# Console 自定义模型模板

## 背景

Console #64 要求用户在模型库新增可部署的模型模板。用户提供的实际页面只有静态 JSON 目录，运行 Console 0.1.2；Swiss 返回旧式 `{index, name, ref, source}` 目录和 `{entry, ...}` 模型接口。现有 #73 需要独立可写 catalog-server 和令牌，不能覆盖该环境。本次仅修改 Console。

## 目标

- 在同一个模型库页面新增模板，保存后与原有模型一起可见，并可进入正常部署流程。
- Console 自己持久化和发布模板，不要求用户额外搭建可写目录服务。
- 原有目录和现有 18 个模型保持可访问，已有部署来源关联保持有效。
- 兼容已部署 Swiss 的 v1 静态目录协议与旧式响应，以及新式 Console/Swiss 响应。

### 非目标

- 修改 Swiss、model-catalog 或 helm-charts 项目代码，覆盖原始远程 JSON，下载模型权重或安装推理引擎。
- 创建真实示例模型、自动部署工作负载、v2 LLMService 发布、修改已有模板版本或重写历史。

## 架构

```text
模型库 → 新增模型模板 → Console 鉴权与校验
  → Console 运行时 ConfigMap 原子保存
  → Console 发布只读 v1 目录
  → 既有 Swiss profile API 注册 console-local
  → 模型库显示自定义卡片 → 既有 Swiss 计划/差异/Helm 部署
```

### 组件模块

| 组件 | 职责 | 数据归属 |
|---|---|---|
| 模型库与新增侧栏 | 结构化模型信息、镜像/GPU/参数，支持参考现有方案 | 用户表单 |
| Console 模板 API | 权限、模板校验、不可变版本、发布与部分失败处理 | Console |
| 运行时 ConfigMap | 精确版本 YAML、元信息、递增发布 generation | 固定 Console 命名空间 |
| 只读目录入口 | 根据 generation 发布 v1 index 与版本 YAML | Console，GET/HEAD |
| Swiss 既有接口 | 注册目录、读取模板、生成计划和部署 | 既有部署后端 |

### API 与配置

拟议 API：

| API | 契约 |
|---|---|
| `GET /api/model-templates` | `enabled,catalogName,catalogURL,generation,index,modelGenerations,registeredGeneration,registrationError?`；index 为 v1，未能确定注册状态时 registeredGeneration=null |
| `POST /api/model-templates/check` | `{metadata:{name,displayName?,description?,family?,tags?,source:{hf}},recipeYAML}`；只校验，不保存、不修改 profile；返回 valid/model/version/variantCount |
| `POST /api/model-templates` | 同上；创建新模型。重复名字拒绝 409；成功连接目录返回 201，已保存但连接暂未完成返回 202；响应含 `created,model,version,catalogName,generation,catalogURL,ready,registeredGeneration,reason?` |
| `POST /api/model-templates/publish` | 重试把最新 generation 注册到部署后端，不重复创建模板；返回 ready 与 registeredGeneration |
| `GET/HEAD /catalog/console/g/{generation}/index.json` | 指定发布快照的静态 v1 目录 |
| `GET/HEAD /catalog/console/g/{generation}/models/{name}/{name}-{version}.yaml` | 指定快照内的精确不可变 recipe |

服务端固定配置 `modelTemplates:{enabled,namespace,configMap,publishURL,backend,catalogName}`。backend 默认 swiss，要求静态 `/api/deploy` 后端；catalogName 默认 console-local。启用时 namespace/configMap/publishURL 必须明确；publishURL 为部署服务可达的 Console 目录根地址，无凭据、查询和 fragment。浏览器不能提供写入命名空间、上游 URL 或发布地址。

Console Helm chart 在存在匹配的部署后端时默认启用本地模板，为 namespace/configMap 自动填入本次 Console release 的信息。目录使用独立 `server.catalogAddr`（默认 `:8081`），通过仅 ClusterIP 的 `<fullname>-catalog` Service 提供，chart 的 `modelTemplates.port` 默认 8081；publishURL 指向该内部 Service。普通 Web/NodePort 对目录路径返回 404。没有部署后端的 Console-only 安装及缺少此节的裸配置保持关闭。chart 创建固定命名空间内的运行时存储 Role，但不渲染或覆盖存储数据 ConfigMap；升级保留用户数据。关闭功能不删除数据。

### 持久化与发布

- 使用一个运行时 ConfigMap 的 state.json 保存不可变模板记录和 generation，总量最多约 900 KiB，单次输入有界，大小超限明确拒绝。
- 新名字使用 resourceVersion CAS 保存，冲突有限重试；同名不覆盖。每条记录固定创建 generation；旧快照只包含不晚于该 generation 的记录。
- 版本 recipe 使用 `catalog.swiss/v1`，包含 name/version/servedName/variants；HF 等模型来源保存在 index 元信息。索引 path 和 digest 必须对应精确保存的 YAML 字节。
- 保留旧 generation 的目录和版本读取；generation 是本地发布快照编号，不冒充 Git commit。
- Swiss 对目录 URL 有缓存，因此每次发布使用新的 generation URL，避免保存后仍读取旧目录。
- 新注册的 console-local 不取代原目录。若 profile 之前依赖服务配置的默认目录，先从既有 cluster/catalog 信息补回原目录项，再追加本地目录，保留默认选择及其余 YAML。
- 使用既有 profile GET/PUT；旧式 parser 不接受 writable/schemaVersion，因此本地 v1 目录项只写 name/url/default。已有同名外部目录不覆盖。
- 发布前后核对当前 state/profile，有限重试，避免把更新的 generation 降级；profile API 无 CAS，不能承诺与另一个管理员的站点编辑具备跨系统事务。
- 模板保存与 profile 注册分离。已保存而未注册时不能报完成或自动部署；页面显示待连接、保留表单结果，并提供重试连接。成功状态需核对 Swiss 已读取对应目录 generation。

### 权限与边界

- 写 API 沿用 Console 会话和密码重置保护，检查 modeltemplates 的 create/update 权限及所选 backend 的 get/update 权限；读 API 检查 modeltemplates get 和 backend get。
- UI 权限为 modeltemplates.view/create，管理员既有通配权限可用；UI 可见性不是授权边界。
- K8s 只访问固定 namespace/configMap；get/update 限定资源名，create 仅在该 namespace。数据由运行时拥有，Helm 不重置用户模板。
- Swiss 静态 HTTP fetcher 不能附加 Console 登录凭据，因此内部专用目录 listener 提供窄范围匿名只读 GET/HEAD，仅发布到 ClusterIP Service；普通 Web/NodePort listener 不提供这些目录路径。内部 listener 不提供模板写 API、OAuth 或 metrics，不接受任意文件路径和任意 URL 代理。发布的模型元信息/recipe 不适合放置明文凭据，应使用部署 Secret 引用。
- 校验名字、版本、变体唯一性、sglang/vllm 引擎与 chart、镜像、GPU 需求及 YAML 文档；限制请求、读取、记录和响应大小，设置超时，不跟随上游重定向，不记录模板正文或凭据。
- v1 模板通过已有 Helm 路径部署；新式 UI 对 v1 的既有 LLMService 限制保持有效。

### 前端兼容

在 Console 的 inferences 模块增加 API 适配器，统一旧 `{index}`/`{entry}` 与新响应；旧 Swiss 缺少 history 接口时从 v1 versions 读取历史。只调整 Console 模块，复制的 Swiss UI 保持原样。

默认模型库把当前默认目录与 Console 自定义模板放在同一列表，卡片保留来源并使用实际 catalog 部署。显式选择目录时按目录过滤；来源选择器以“默认与自定义”标明默认视图。新增后刷新本地、cluster/profile/catalog 查询；未连接的模板仍可见并明确限制部署。

## 场景

### 接入

升级 Console 自己的 chart 和镜像；无需改造外部静态目录。管理员可覆盖 modelTemplates 的存储和发布地址。新配置 Role 验证通过后，模型库出现“新增模型模板”。原目录仍正常返回并显示原模型。

### 新增私有模型模板

填写模型名、权重来源和部署方案，可参考已有模型的引擎/镜像/GPU/values。点击校验只检查格式；点击保存后 ConfigMap 保存模板，目录注册成功则卡片可进入详情和正常部署表单。创建模板本身不下载权重、不修改推理工作负载。

### 连接失败与重试

如果已有模板保存成功、部署后端暂时不可达，返回 202 并显示“待连接目录”；页面仍显示新模板，重试连接不重复创建。并发同名创建返回 409，存储失败不报告保存成功。原目录来源和既有模型不因本地目录失败而消失。

## 验证

实现需覆盖：旧/新响应适配，参考模板填充与本地卡片来源，校验/创建/部分失败/重试，权限和固定存储边界，CAS/重复创建/数据大小，generation 快照与精确 digest，profile 原目录保留和旧 parser 可接受字段，旧与新 Swiss 读取兼容。真实用户目录只读检查，不写入虚构模型；实际部署验收另行明确记录。

已使用旧版 Swiss `dfdc4be` 命令行实际读取 `State.Index/Recipe` 发布的 HTTP 目录，并生成 `plan.swiss/v1` 计划；没有执行 install/apply。可在 Console 仓库根目录重现：

```sh
SWISS_CATALOG_COMPAT_BIN=/path/to/swiss go test ./internal/modeltemplate -run TestPublishedTemplateComposesWithLegacySwiss -v
```

未配置外部工具时该补充测试跳过；常规 HTTP、存储和权限测试仍运行。
