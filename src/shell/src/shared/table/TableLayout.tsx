import type { ComponentPropsWithoutRef, ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
  "data-bleed-role"?: string;
}

export function TableScroll({
  children,
  className = "",
  ...props
}: LayoutProps) {
  return (
    <div
      className={`table-layout-scroll ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function StickyActionHeader({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"th">) {
  return <th className={`table-layout-action table-layout-action--header ${className}`} {...props} />;
}

export function StickyActionCell({
  children,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"td">) {
  return (
    <td className={`table-layout-action ${className}`} {...props}>
      {children}
    </td>
  );
}
