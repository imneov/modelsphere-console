# Code review

For reviewers. Adapted from [Google's Engineering Practices](https://google.github.io/eng-practices/review/), which is worth reading in full.

## The standard

Approve once the PR **definitely improves the overall health of the code**, even if it is not perfect. There is no perfect code, only better code; do not hold a PR for polish that a follow-up can do.

- Technical facts and data overrule opinions and personal preference.
- On style, the [conventions](coding-conventions.md) and [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments) are the authority. Anything they do not cover is the author's call.
- Design is almost never only style or preference — weigh it on principles.
- Teaching is part of review: a comment that shows the author something new is welcome; prefix optional ones with `Nit:` or `Optional:`.

## What to look for

| | Ask |
|---|---|
| Design | Does it belong in this place — this package, this module, console at all rather than swiss or the gateway? |
| Behaviour | Does it do what the issue asked? Edge cases: empty lists, a backend down, a token expired, two replicas |
| Security | Every new endpoint authorized? Identity headers not forwardable from the browser? No secrets in logs or responses? UI gating backed by a server check? |
| Compatibility | CRDs, token claims, config keys, chart values, `/v1` — can an existing install upgrade without action? If not, is there an `action required:` release note? |
| Complexity | Can it be simpler? Is anything built for a future need nobody has yet? |
| Tests | Present, named as claims, fail without the change, no sleeps |
| Names | Clear enough that the comment is unnecessary |
| Comments | Explain why, not what |
| Docs | README, chart README, `examples/console.yaml`, design doc updated where behaviour moved |
| UI | Screenshots attached; works in each sidebar layout (preferences panel); strings consistent with existing menus; actions gated by the same permission the server checks |

Read **every line** you are asked to review, in context — open the whole file when the diff is not enough. And say what is good, not only what is wrong.

## Navigating a PR

1. Read the description. Does the change make sense at all? If not, say so first, kindly, before any line comments.
2. Read the most important part first — usually the core logic or the API. A design problem found here saves reviewing the rest.
3. Then the rest, in an order that makes sense: tests often explain the change best.

## Writing comments

- Be kind; comment on the code, never on the person.
- Explain why: "this leaks the gateway key into the access log" rather than "don't log this".
- Point out the problem and let the author find the fix, unless the fix is not obvious.
- Prefer "can this be simpler?" or "a comment here would help the next reader" over accepting an explanation that exists only in the PR thread.
- Label severity: blocking by default; `Nit:` and `Optional:` are not.

## Speed

- Respond within two working days. A quick "I'll look tomorrow" beats silence.
- Large PR? Ask for a split rather than letting it sit.
- Approve with nits when the remaining points are minor and you trust the author to address them.
