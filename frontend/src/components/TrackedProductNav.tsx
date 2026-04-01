import { Link, type LinkProps } from "react-router-dom";
import {
  sendProductNavClick,
  type ProductNavSource,
  type ProductNavTarget,
} from "@/utils/analytics";

export type TrackedProductLinkProps = Omit<LinkProps, "onClick"> & {
  navTarget: ProductNavTarget;
  navSource: ProductNavSource;
  onClick?: LinkProps["onClick"];
};

/**
 * react-router Link to /evaluate or /install with shared `product_nav_click` analytics.
 */
export function TrackedProductLink({
  navTarget,
  navSource,
  onClick,
  ...rest
}: TrackedProductLinkProps) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        sendProductNavClick(navTarget, navSource);
        onClick?.(e);
      }}
    />
  );
}
