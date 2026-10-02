import { Badge as KitBadge, cn } from "@modelsphere/ui";

type KitVariant = NonNullable<React.ComponentProps<typeof KitBadge>["variant"]>;

// `muted` is swiss's, not the kit's; it rides on `secondary`. Colour is never the
// only signal: every badge carries text as well.
export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: KitVariant | "muted" }) {
  return (
    <KitBadge
      variant={variant === "muted" ? "secondary" : variant}
      className={cn(variant === "muted" && "bg-muted text-muted-foreground", className)}
      {...props}
    />
  );
}
