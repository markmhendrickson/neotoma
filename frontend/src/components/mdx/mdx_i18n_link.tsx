import type { ComponentProps } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "@/i18n/LocaleContext";
import { localizePath } from "@/i18n/routing";

type MdxI18nLinkProps = Omit<ComponentProps<typeof Link>, "to"> & { to: string };

/** Internal SPA link that respects the active locale prefix. */
export function MdxI18nLink({ to, className, children, ...rest }: MdxI18nLinkProps) {
  const { locale } = useLocale();
  return (
    <Link to={localizePath(to, locale)} className={className} {...rest}>
      {children}
    </Link>
  );
}
