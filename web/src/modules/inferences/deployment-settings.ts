import { EMPTY as SWISS_EMPTY, formFromPlan as swissFormFromPlan, planRequest as swissPlanRequest, type Form } from "@swiss/components/DeploySettings";
import type { Plan } from "@swiss/lib/api";
import { ENABLE_MONITOR } from "./features";

function monitorSettings(form: Form): Form {
  return ENABLE_MONITOR ? form : { ...form, monitor: false, monitorModel: "", monitorGpuType: "" };
}

export const EMPTY: Form = monitorSettings(SWISS_EMPTY);

export const formFromPlan = (plan: Plan): Form => monitorSettings(swissFormFromPlan(plan));

export const planRequest = (form: Form, options: Parameters<typeof swissPlanRequest>[1]) => swissPlanRequest(monitorSettings(form), options);
