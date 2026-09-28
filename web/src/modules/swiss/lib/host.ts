// The one file that binds swiss's pages to where they run. In the console it
// points at the shell; in standalone swiss the same names re-export
// react-router and window.fetch unchanged. Everything else in this module is a
// copy of swiss/web/src.
import { createElement, type ComponentProps } from "react";
import {
  Link as RRLink,
  Navigate as RRNavigate,
  NavLink as RRNavLink,
  useNavigate as useRRNavigate,
  type To,
} from "react-router";
import { apiFetch, useModulePath } from "@/shell";

export { useLocation, useParams, useSearchParams } from "react-router";

// console proxies this prefix to swissd's /api (console.yaml backends: swiss).
const API_BASE = "/api/deploy";

// apiPath maps swissd's own path ("/api/catalog") onto the console proxy.
export function apiPath(path: string): string {
  return API_BASE + path.replace(/^\/api(?=\/|$)/, "");
}

export const hostFetch: typeof fetch = (input, init) => apiFetch(String(input), init);

// Swiss links are written as absolute app paths ("/catalog"). Under the console
// they are relative to the module's mount point.
function useTo(): (to: To) => To {
  const p = useModulePath();
  return (to) => (typeof to === "string" && to.startsWith("/") ? p(to) : to);
}

export function Link(props: ComponentProps<typeof RRLink>) {
  const map = useTo();
  return createElement(RRLink, { ...props, to: map(props.to) });
}

export function NavLink(props: ComponentProps<typeof RRNavLink>) {
  const map = useTo();
  return createElement(RRNavLink, { ...props, to: map(props.to) });
}

export function Navigate(props: ComponentProps<typeof RRNavigate>) {
  const map = useTo();
  return createElement(RRNavigate, { ...props, to: map(props.to) });
}

export function useNavigate(): ReturnType<typeof useRRNavigate> {
  const navigate = useRRNavigate();
  const map = useTo();
  return ((to: To | number, opts?: object) =>
    typeof to === "number" ? navigate(to) : navigate(map(to), opts)) as ReturnType<typeof useRRNavigate>;
}
