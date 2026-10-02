import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@riseaicloud/ui";
import { DEFAULT_LAYOUT, LAYOUTS, setLayout, useLayout, type Layout } from "@/shell/preferences";
import { useT } from "@/shell/i18n";
import { LocaleSwitch } from "@/shell/LocaleSwitch";

// A slice of Rise Global's preferences panel (console/src/components/preferences):
// the same right-hand drawer, header and layout cards, with only the layouts this
// console renders. Non-modal on purpose, as in Global: the value of the panel is
// seeing the page change behind it.
export function PreferencesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const layout = useLayout();
  const t = useT("shell");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l bg-background shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-200 data-[state=open]:duration-300"
        >
          <div className="flex items-start justify-between border-b px-4 py-4">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">{t("preferences.title")}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {t("preferences.description")}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden"
              aria-label={t("common:actions.close")}
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-auto px-4 py-1">
            <div className="flex flex-col py-4">
              <h3 className="mb-3 leading-none font-semibold tracking-tight">{t("preferences.language")}</h3>
              <LocaleSwitch />
            </div>
            <div className="flex flex-col py-4">
              <h3 className="mb-3 leading-none font-semibold tracking-tight">{t("preferences.layout")}</h3>
              <div className="grid grid-cols-3 justify-items-center gap-x-2 gap-y-3">
                {LAYOUTS.map(({ value, key }) => (
                  <OutlineBox
                    key={value}
                    active={layout === value}
                    label={t(`preferences.layouts.${key}.label`)}
                    hint={t(`preferences.layouts.${key}.hint`)}
                    onClick={() => setLayout(value)}
                  >
                    <LayoutThumb variant={value} />
                  </OutlineBox>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => setLayout(DEFAULT_LAYOUT)} disabled={layout === DEFAULT_LAYOUT}>
              {t("preferences.restoreDefault")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function OutlineBox({
  active,
  label,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex cursor-pointer flex-col" onClick={onClick} role="radio" aria-checked={active} aria-label={label}>
      <div
        className={`flex items-center justify-center rounded-md p-[6px] ring-1 transition-shadow ${
          active ? "ring-2 ring-primary" : "ring-border hover:ring-primary/50"
        }`}
      >
        {children}
      </div>
      <div className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <span>{label}</span>
        <span title={hint} aria-label={`${label}: ${hint}`} className="flex items-center text-muted-foreground/60">
          <CircleHelp className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

// ── Thumbnails, drawn as in Global: navigation in the primary colour, content in greys ──

const NavBar = ({ w = "w-full" }: { w?: string }) => <div className={`h-[3px] rounded-[1px] bg-primary-foreground/70 ${w}`} />;
const MenuBar = ({ w = "w-full" }: { w?: string }) => <div className={`h-[3px] rounded-[1px] bg-muted-foreground/40 ${w}`} />;
const Card = ({ className = "" }: { className?: string }) => <div className={`rounded-[1px] bg-muted-foreground/15 ${className}`} />;
const Logo = () => <div className="h-[7px] w-[7px] shrink-0 rounded-[2px] bg-primary-foreground" />;

const ContentCol = () => (
  <div className="flex flex-1 flex-col gap-[4px] bg-muted/40 p-[4px]">
    <div className="flex flex-1 gap-[4px]">
      <Card className="flex-1" />
      <Card className="flex-1" />
    </div>
    <Card className="h-[11px] w-full" />
  </div>
);

const SecondaryCol = () => (
  <div className="flex w-[22px] flex-col gap-[4px] bg-muted/70 p-[4px]">
    <MenuBar />
    <MenuBar w="w-[10px]" />
    <MenuBar w="w-[11px]" />
  </div>
);

const TopBar = () => (
  <div className="flex h-[13px] shrink-0 items-center gap-[4px] bg-primary px-[4px]">
    <Logo />
    <NavBar w="w-[12px]" />
    <NavBar w="w-[9px]" />
    <NavBar w="w-[10px]" />
  </div>
);

const FRAME = "flex h-[64px] w-[100px] overflow-hidden rounded-[4px] ring-1 ring-border";

function LayoutThumb({ variant }: { variant: Layout }) {
  if (variant === "mixed-nav") {
    return (
      <div className={`${FRAME} flex-col`}>
        <TopBar />
        <div className="flex flex-1">
          <SecondaryCol />
          <ContentCol />
        </div>
      </div>
    );
  }
  if (variant === "classic") {
    return (
      <div className={`${FRAME} flex-col`}>
        <TopBar />
        <div className="flex flex-1 gap-[4px] bg-muted/40 p-[4px]">
          <div className="flex w-[20px] flex-col gap-[4px] rounded-[2px] border border-border bg-background p-[3px]">
            <MenuBar />
            <MenuBar w="w-[9px]" />
            <MenuBar w="w-[10px]" />
          </div>
          <div className="flex flex-1 flex-col gap-[4px]">
            <div className="flex flex-1 gap-[4px]">
              <Card className="flex-1" />
              <Card className="flex-1" />
            </div>
            <Card className="h-[11px] w-full" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${FRAME} bg-surface-page`}>
      <SecondaryCol />
      <div className="m-[3px] ml-0 flex flex-1 flex-col overflow-hidden rounded-[3px] bg-card">
        <div className="flex h-[11px] shrink-0 items-center gap-[3px] border-b border-border px-[3px]">
          <div className="size-[5px] shrink-0 rounded-[1px] border border-muted-foreground/40" />
          <div className="h-[3px] w-[10px] rounded-[1px] bg-muted-foreground/40" />
          <div className="h-[3px] w-[8px] rounded-[1px] bg-muted-foreground/40" />
        </div>
        <div className="flex-1 p-[3px]">
          <div className="h-[3px] w-[70%] rounded-full bg-muted-foreground/20" />
        </div>
      </div>
    </div>
  );
}
