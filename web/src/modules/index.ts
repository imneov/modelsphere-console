// The installed modules, in sidebar order. Add or remove a line to plug one in or out.
import type { ConsoleModule } from "@/shell";
import { docsModule } from "@/modules/docs";
import { iamModule } from "@/modules/iam";
import { inferencesModule } from "@/modules/inferences";
import { playgroundModule } from "@/modules/playground";
import { routerModule } from "@/modules/router";
import { billingModule } from "@/modules/billing";

export const modules: ConsoleModule[] = [inferencesModule, playgroundModule, routerModule, billingModule, iamModule, docsModule];
