# FAQ

## A menu is missing

The sidebar shows only pages your account may open. Ask an administrator to grant the page permission on your role; see [Access control](/help/docs/access-control).

## The Playground says no model is deployed

The gateway has no model to call yet. Check:

1. whether [Inference Services](/inferences) has a service in the Serving state;
2. whether "Publish route" was on when it was deployed — a model without a route does not appear on the gateway.

## An inference service stays in Loading

A cold start of a large model takes 20–40 minutes; that is normal. After an hour it turns Not ready. Look at the **Instances**, **Events** and **Logs** tabs of the service. Common causes:

- not enough GPUs, so the pod cannot be scheduled — check free GPUs on [Nodes](/inferences/nodes);
- the image or weights failed to download — see events and logs.

## Deploy and upgrade buttons are greyed out

"This swissd is read-only": swissd on the cluster may not deploy. An operator has to turn on `allowDeploy` in Swiss's configuration.

"A release without a plan cannot be upgraded here": the service was not deployed by Swiss and can only be viewed.

## The Playground reports a gateway error

| Message | What to do |
|---|---|
| no llm backend configured | the console was installed without a gateway; an operator sets `playground.gateway` in the chart |
| the gateway rejected the credentials | wrong gateway key; check the Secret referenced by the entrypoint auth in the site profile |
| no permission on the llm backend | the role needs get and create on `backends/llm` |
| the gateway is unreachable | its address did not resolve or the service is down; contact an operator |

## A program gets 401

The API key is missing, wrong, expired or deleted. Check it on [API Keys](/router/api-keys) and create a new one if needed.

## Forgotten password

Ask an administrator. Once signed in, you can change your password any time from the avatar menu.
