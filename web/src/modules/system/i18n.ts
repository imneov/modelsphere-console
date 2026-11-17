import { registerI18n, useT as useShellT } from "@/shell";
import zh from "./locales/zh-CN.json";
import en from "./locales/en-US.json";

registerI18n("system", { "zh-CN": zh, "en-US": en });

export const useT = () => useShellT("system");
