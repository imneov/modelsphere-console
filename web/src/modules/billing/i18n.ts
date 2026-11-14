import { registerI18n, useT as useShellT } from "@/shell";
import zh from "@/modules/billing/locales/zh-CN.json";
import en from "@/modules/billing/locales/en-US.json";
registerI18n("billing", { "zh-CN": zh, "en-US": en });
export const useT = () => useShellT("billing");
