// The installed modules, in sidebar order. Add or remove a line to plug one in or out.
import type { ConsoleModule } from "@/shell";
import { iamModule } from "@/modules/iam";
import { playgroundModule } from "@/modules/playground";
import { routerModule } from "@/modules/router";

export const modules: ConsoleModule[] = [playgroundModule, routerModule, iamModule];
