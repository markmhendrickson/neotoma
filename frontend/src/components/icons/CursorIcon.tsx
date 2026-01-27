import { LucideProps } from "lucide-react";

/**
 * Official Cursor brand icon (cube only)
 * Source: https://cursor.com/brand
 * SVG from: https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/brand/brand-logo-7.svg
 */
export function CursorIcon({ className, size = 16, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="675 356 250 287"
      fill="none"
      className={className}
      width={size}
      height={size}
      {...props}
    >
      {/* Cursor cube icon - extracted from official brand assets */}
      <path
        fill="currentColor"
        d="M920.015 424.958L805.919 359.086C802.256 356.97 797.735 356.97 794.071 359.086L679.981 424.958C676.901 426.736 675 430.025 675 433.587V566.419C675 569.981 676.901 573.269 679.981 575.048L794.077 640.92C797.74 643.036 802.261 643.036 805.925 640.92L920.02 575.048C923.1 573.269 925.001 569.981 925.001 566.419V433.587C925.001 430.025 923.1 426.736 920.02 424.958H920.015ZM912.848 438.911L802.706 629.682C801.961 630.968 799.995 630.443 799.995 628.954V504.039C799.995 501.543 798.662 499.234 796.498 497.981L688.321 435.526C687.036 434.781 687.561 432.816 689.05 432.816H909.334C912.462 432.816 914.417 436.206 912.853 438.917H912.848V438.911Z"
      />
    </svg>
  );
}
