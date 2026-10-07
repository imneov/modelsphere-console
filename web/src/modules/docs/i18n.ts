import { registerI18n, useT as useShellT } from "@/shell";
import zh from "@/modules/docs/locales/zh-CN.json";
import en from "@/modules/docs/locales/en-US.json";

registerI18n("docs", { "zh-CN": zh, "en-US": en });

export const useT = () => useShellT("docs");
