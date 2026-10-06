# Calling the API

Programs call models through the console's `/v1` endpoint. It is OpenAI-compatible and takes an API key.

## Create an API key

Open [Router → API Keys](/router/api-keys) and click **New API key**:

| Field | Notes |
|---|---|
| Name, description | What the key is for, e.g. the calling system |
| Expiry | 7 days / 1 month / 6 months / never |
| Models | All models, or only the ones you pick |

> **The key is shown once, when it is created.** It cannot be viewed after the dialog closes; copy it right away. A lost key can only be deleted and recreated.

Deleting a key cuts off every program using it immediately.

## Endpoint

- Base URL: `http://<console address>/v1` (the dialog after creating a key shows the current one)
- Header: `Authorization: Bearer <API key>`

## Examples

Set the environment first:

```bash
export MODELSPHERE_API_KEY=<your API key>
export MODELSPHERE_BASE_URL=http://<console address>/v1
```

List models:

```bash
curl $MODELSPHERE_BASE_URL/models \
  -H "Authorization: Bearer $MODELSPHERE_API_KEY"
```

Chat completion:

```bash
curl $MODELSPHERE_BASE_URL/chat/completions \
  -H "Authorization: Bearer $MODELSPHERE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "<model>", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 64}'
```

Python (OpenAI SDK):

```python
import os
from openai import OpenAI

client = OpenAI(base_url=os.environ["MODELSPHERE_BASE_URL"], api_key=os.environ["MODELSPHERE_API_KEY"])
stream = client.chat.completions.create(
    model="<model>",
    messages=[{"role": "user", "content": "hello"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

Node.js (OpenAI SDK):

```js
import OpenAI from "openai";

const client = new OpenAI({ baseURL: process.env.MODELSPHERE_BASE_URL, apiKey: process.env.MODELSPHERE_API_KEY });
const res = await client.chat.completions.create({
  model: "<model>",
  messages: [{ role: "user", content: "hello" }],
});
console.log(res.choices[0].message.content);
```

The model name is the `id` returned by `/v1/models`, also shown in the Playground's model picker. Once parameters are tuned in the Playground, **View code** gives you the matching request.

## Keep the cache across turns

Send the same `X-Session-Id` header with every request of one conversation. The gateway routes them to the same inference instance, the prefix cache keeps hitting and time to first token drops.

## Common errors

| Status | Cause |
|---|---|
| 401 | key missing, wrong, expired or deleted |
| 403 | the key is not allowed to use this model |
| 404 | no such model; check `/v1/models` |
