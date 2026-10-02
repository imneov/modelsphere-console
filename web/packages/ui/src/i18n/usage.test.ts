// 取词用法的静态检查：key 必须存在；以对象字面量传参时变量要传齐；复数变量不得传字符串；
// zh 与 en 用到的变量一致（白名单除外）；模块顶层不得调用 uiT。
// 只检查 import 了 i18n/index.ts 或 i18n/store.ts 的文件，避免误伤其它名为 t 的函数。
import { test } from "vitest"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
// TypeScript 7 (the native compiler console builds with) has no JS compiler API; this test parses with 5.
import ts from "typescript-5"
import zhCN from "../locales/ui.zh-CN"
import enUS from "../locales/ui.en-US"

const SRC = fileURLToPath(new URL("..", import.meta.url))
const CALLEES = new Set(["t", "uiT", "uiKey"])

/** spec §4.4 规则 10：zh 与 en 使用的变量允许不同的 key，值写原因。 */
export const VAR_SUBSET_ALLOWED: Record<string, string> = {
  "confirmDialog.busyWithAction": "英文无法由调用方动词生成进行时（spec §4.4 规则 2）",
  "confirmDialog.itemsWithAction": "英文句中放不下调用方动词（spec §4.4 规则 2）",
  "dateRangePicker.monthTitle": "zh 用 month，en 用 monthName（spec §4.4 规则 9）",
  "transferList.selectFirst": "actionLabel 是调用方自定义动作名（非动词原形），嵌进「先勾选要…的项」英文句中语法不通，改用固定文案（spec §4.4 规则 2，仿 confirmDialog.itemsWithAction）",
}

function lookup(dict: unknown, key: string): unknown {
  let node = dict
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

function varsOf(template: string): { all: Set<string>; plural: Set<string> } {
  const bare = template.replace(/''/g, "").replace(/'[{}#|][^']*'/g, "")
  const all = new Set<string>()
  const plural = new Set<string>()
  for (const m of bare.matchAll(/\{\s*([A-Za-z_]\w*)\s*(?=[,}])(?:,\s*(plural|select|selectordinal))?/g)) {
    all.add(m[1])
    if (m[2] === "plural" || m[2] === "selectordinal") plural.add(m[1])
  }
  return { all, plural }
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if (ts.isShorthandPropertyAssignment(p)) return p.name.text
  if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text
  return null
}

function isStringish(e: ts.Expression): boolean {
  if (ts.isStringLiteralLike(e) || ts.isTemplateExpression(e)) return true
  if (ts.isCallExpression(e)) {
    const callee = e.expression.getText()
    return /(^|\.)(fmt\w*|format\w*|toLocaleString|toFixed|String)$/.test(callee)
  }
  return false
}

/**
 * 从取词调用的第一个参数里递归收集候选 key。
 * 字符串字面量给出确定的一个 key；`cond ? "a" : "b"` 这类三元表达式两支都可能在运行时
 * 被取到，两个都要查；圆括号原样透传；其余（变量、拼接……）在编译期定不出字面量，
 * 跳过而不是当报错 —— 这类调用得靠运行时兜底（`uiT` 缺 key 返回 key 原文）兜底。
 */
function collectKeys(e: ts.Expression): string[] {
  if (ts.isParenthesizedExpression(e)) return collectKeys(e.expression)
  if (ts.isStringLiteralLike(e)) return [e.text]
  if (ts.isConditionalExpression(e)) return [...collectKeys(e.whenTrue), ...collectKeys(e.whenFalse)]
  return []
}

export function checkSource(fileName: string, text: string): string[] {
  if (!/from\s+["'](\.\.?\/)+(i18n\/(index|store)\.ts|i18n\/index|i18n\/store)["']/.test(text) && !/\/i18n\//.test(fileName)) return []
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const problems: string[] = []
  const at = (n: ts.Node) => `${fileName}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`

  const visit = (node: ts.Node, inFunction: boolean): void => {
    const nextIn = inFunction || ts.isFunctionLike(node)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CALLEES.has(node.expression.text)) {
      const callee = node.expression.text
      if (callee === "uiT" && !inFunction) problems.push(`${at(node)} 模块顶层调用 uiT`)
      const [k, v] = node.arguments
      if (k) {
        for (const key of collectKeys(k)) {
          const zh = lookup(zhCN, key)
          const en = lookup(enUS, key)
          if (typeof zh !== "string" || typeof en !== "string") {
            problems.push(`${at(node)} key 不存在：${key}`)
          } else if (callee !== "uiKey") {
            const zv = varsOf(zh)
            const ev = varsOf(en)
            if (!(key in VAR_SUBSET_ALLOWED) && !sameSet(zv.all, ev.all)) problems.push(`${at(node)} ${key}：zh 与 en 的变量不一致`)
            const need = new Set([...zv.all, ...ev.all])
            if (!v) {
              if (need.size) problems.push(`${at(node)} ${key}：缺少参数 ${[...need].join(", ")}`)
            } else if (ts.isObjectLiteralExpression(v) && !v.properties.some(ts.isSpreadAssignment)) {
              const passed = new Map<string, ts.Expression>()
              for (const p of v.properties) {
                const name = propName(p)
                if (!name) continue
                if (ts.isPropertyAssignment(p)) passed.set(name, p.initializer)
                else if (ts.isShorthandPropertyAssignment(p)) passed.set(name, p.name)
              }
              for (const name of need) if (!passed.has(name)) problems.push(`${at(node)} ${key}：未传参数 ${name}`)
              for (const name of ev.plural) {
                const e = passed.get(name)
                if (e && isStringish(e)) problems.push(`${at(node)} ${key}：复数变量 ${name} 传入了字符串`)
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, (c) => visit(c, nextIn))
  }
  visit(sf, false)
  return problems
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== "locales" && e.name !== "__tests__") sourceFiles(p, out) }
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(e.name)) out.push(p)
  }
  return out
}

test("检查器自测：能发现各类问题", () => {
  const fixture = [
    'import { uiT, useUiT, uiKey } from "../i18n/index"',
    'const TOP = uiT("shared.cancel")',
    'const K = uiKey("shared.nope")',
    'export function C() { const t = useUiT(); return t("shared.cancel") + t("x.missing") }',
    'export function D(flag: boolean) { const t = useUiT(); return t(flag ? "shared.cancel" : "x.typo") }',
  ].join("\n")
  const found = checkSource("components/fixture.tsx", fixture)
  assert.ok(found.some((s) => s.includes("模块顶层调用 uiT")), found.join("\n"))
  assert.ok(found.some((s) => s.includes("key 不存在：shared.nope")), found.join("\n"))
  assert.ok(found.some((s) => s.includes("key 不存在：x.missing")), found.join("\n"))
  assert.ok(!found.some((s) => s.includes("shared.cancel") && s.includes(":4 ")), "组件内的合法调用不报")
  assert.ok(found.some((s) => s.includes("key 不存在：x.typo")), "三元表达式两支都要查：" + found.join("\n"))
  assert.ok(!found.some((s) => s.includes("key 不存在：shared.cancel")), "三元表达式合法的一支不应误报：" + found.join("\n"))
})

test("design/src 的取词用法全部合规", () => {
  const problems = sourceFiles(SRC).flatMap((f) => checkSource(path.relative(SRC, f), fs.readFileSync(f, "utf8")))
  assert.deepEqual(problems, [])
})
