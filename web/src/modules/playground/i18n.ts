import { registerI18n, useT as useShellT } from "@/shell";
import zh from "@/modules/playground/locales/zh-CN.json";
import en from "@/modules/playground/locales/en-US.json";

registerI18n("playground", { "zh-CN": zh, "en-US": en });

export const useT = () => useShellT("playground");
