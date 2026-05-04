type OpenCodeIconProps = {
  className?: string;
  "aria-hidden"?: boolean;
  size?: number;
};

/**
 * OpenCode icon — vector mark from the official OpenCode brand page.
 * Source: https://opencode.ai/brand
 */
export function OpenCodeIcon({ className, size, "aria-hidden": ariaHidden }: OpenCodeIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaHidden}
      role={ariaHidden ? undefined : "img"}
    >
      <path d="M18 24H6V12H18V24Z" fill="currentColor" opacity="0.45" />
      <path d="M18 6H6V24H18V6ZM24 30H0V0H24V30Z" fill="currentColor" />
    </svg>
  );
}
