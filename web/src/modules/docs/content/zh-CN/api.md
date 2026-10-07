# 调用 API

程序通过 console 的 `/v1` 接口调用模型，接口与 OpenAI 兼容，凭 API 密钥访问。

## 创建 API 密钥

打开 [路由 → API 密钥](/router/api-keys)，点 **新建 API 密钥**：

| 字段 | 说明 |
|---|---|
| 名称、描述 | 便于识别用途，例如调用方系统的名字 |
| 有效期 | 7 天 / 1 个月 / 6 个月 / 永不过期 |
| 可用模型 | 全部模型，或只允许指定的模型 |

> **密钥只在创建时显示一次。** 关闭对话框后无法再次查看，请立即复制保存。遗失后只能删除重建。

删除密钥后，使用它的程序会立即无法访问。

## 接口地址

- Base URL：`http://<console 地址>/v1`（创建密钥后的对话框里会显示当前地址）
- 请求头：`Authorization: Bearer <API 密钥>`

## 示例

先设置环境变量：

```bash
export MODELSPHERE_API_KEY=<你的 API 密钥>
export MODELSPHERE_BASE_URL=http://<console 地址>/v1
```

列出可用模型：

```bash
curl $MODELSPHERE_BASE_URL/models \
  -H "Authorization: Bearer $MODELSPHERE_API_KEY"
```

对话补全：

```bash
curl $MODELSPHERE_BASE_URL/chat/completions \
  -H "Authorization: Bearer $MODELSPHERE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "<模型名>", "messages": [{"role": "user", "content": "你好"}], "max_tokens": 64}'
```

Python（OpenAI SDK）：

```python
import os
from openai import OpenAI

client = OpenAI(base_url=os.environ["MODELSPHERE_BASE_URL"], api_key=os.environ["MODELSPHERE_API_KEY"])
stream = client.chat.completions.create(
    model="<模型名>",
    messages=[{"role": "user", "content": "你好"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

Node.js（OpenAI SDK）：

```js
import OpenAI from "openai";

const client = new OpenAI({ baseURL: process.env.MODELSPHERE_BASE_URL, apiKey: process.env.MODELSPHERE_API_KEY });
const res = await client.chat.completions.create({
  model: "<模型名>",
  messages: [{ role: "user", content: "你好" }],
});
console.log(res.choices[0].message.content);
```

模型名就是 `/v1/models` 返回的 `id`，也就是 Playground 模型下拉框里「·」后面的部分。在 Playground 里调好参数后，用 **查看代码** 可以直接得到对应的请求。

## 多轮对话保持缓存

同一段对话的多次请求带上相同的 `X-Session-Id` 请求头，网关会把它们路由到同一个推理实例，前缀缓存保持命中，首字延迟更低。

## 常见错误

| 状态码 | 原因 |
|---|---|
| 401 | 密钥缺失、错误、已过期或已删除 |
| 403 | 密钥没有被授权访问这个模型 |
| 404 | 模型名不存在，先用 `/v1/models` 确认 |
