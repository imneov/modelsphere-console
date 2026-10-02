import { registerI18n, useT as useShellT } from "@/shell";
import zh from "@/modules/router/locales/zh-CN.json";
import en from "@/modules/router/locales/en-US.json";

registerI18n("router", { "zh-CN": zh, "en-US": en });

export const useT = () => useShellT("router");
