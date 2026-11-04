# L3 KV cache overview

The Model Serving sidebar opens a paginated service configuration table at `/inferences/l3-kv-cache`.

| Display | Source and meaning |
|---|---|
| Service / model, namespace | Existing deployments list |
| Configured on / off | Explicit boolean `storageKVOffload.enabled` in the stored plan's merged layers |
| Unknown | No plan, legacy plan without layers, or no explicit readable enable setting |
| Unreadable | The plan request failed |
| Unsupported | A readable plan uses a chart or engine outside the supported SGLang contract |
| Chart / engine support | SGLang engine with released SGLang chart >= 0.9.27; vLLM is unsupported |
| Backend and host parameters | Recorded merged plan values, including inherited values; absent values stay unrecorded |
| Summary | Mutually exclusive configuration states on the current page; chart/engine support remains a separate row field |

- Stored settings describe desired configuration, not runtime activity, actual capacity, cache hits or hit rates.
- L3 storage-backed KV cache is distinct from host-only L2 offload and compile cache.
- A legacy unsupported deployment can have Unknown configuration and Unsupported chart/engine support simultaneously.
- The list requests 25 services per page. Only those rows request stored plans and live service status. No catalog, node, ModelRoute or scaler scan is needed.
- Configure requires deployment permissions, a tracked model, readable plan layers, a supported chart/engine, and a confirmed installed service. Uninstalling services cannot be configured. Service details remain available.

```text
paged deployments -> visible-row plan + status -> table and page counts
Configure -> existing upgrade sheet, section=l3 -> existing diff/apply flow
Service details -> existing inference service details
Deploy from model library -> existing model library
```

The page uses existing `deployments`, `releasePlan`, `status` and `cluster` query keys so successful upgrades refresh the overview. It introduces no editing API or independent cache-service lifecycle.

## Focused verification

目的：验证真实数据映射、未知配置、写入保护、分页请求范围及服务表格输出。

步骤：在 `web/` 执行：

```sh
npm test -- src/modules/inferences/l3-overview.test.tsx src/modules/inferences/locales.test.ts
npm run typecheck
```

记录：类型化测试数据覆盖显式开启/关闭、继承参数、历史无 layers 计划、读取失败、只读站点、卸载中服务，以及当前页汇总和服务详情链接。已在既有预览入口核验独立列表、一级 L3 页签、跨页签编辑保留、最终计划映射和错误页签定位，截图与中文记录保存在任务验收资料中。预览中的历史服务没有完整 L3 记录，列表如实显示未知；当前没有可编辑的已部署 L3 服务，因此未将配置按钮的静态渲染测试当作该实时数据条件下的浏览器点击验收。
