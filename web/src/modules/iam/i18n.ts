import { registerI18n, useT as useShellT } from "@/shell";
import zh from "@/modules/iam/locales/zh-CN.json";
import en from "@/modules/iam/locales/en-US.json";

registerI18n("iam", { "zh-CN": zh, "en-US": en });

export const useT = () => useShellT("iam");
