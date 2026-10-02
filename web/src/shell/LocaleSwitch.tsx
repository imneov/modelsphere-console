import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@riseaicloud/ui";
import { LOCALES, useLocale, type Locale } from "@/shell/i18n";

// The language picker for the preferences panel and the login page. The top
// bar's icon menu (Layout.tsx) drives the same locale state.
export function LocaleSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      <SelectTrigger className={`h-9 ${className}`}>
        <SelectValue />
      </SelectTrigger>
      {/* Above the z-50 preferences drawer. */}
      <SelectContent className="z-60">
        {LOCALES.map((l) => (
          <SelectItem key={l.value} value={l.value}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
