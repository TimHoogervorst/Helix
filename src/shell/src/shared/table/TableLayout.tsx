import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type TableStretchMode = "auto" | "full";

interface LayoutProps {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function TableStretch({
  children,
  mode = "auto",
  className = "",
  ...props
}: LayoutProps & { mode?: TableStretchMode }) {
  return (
    <div
      className={`table-layout-stretch table-layout-stretch--${mode} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function TableScroll({
  children,
  mode = "full",
  className = "",
  ...props
}: LayoutProps & { mode?: TableStretchMode }) {
  return (
    <div
      className={`table-layout-scroll table-layout-scroll--${mode} ${className}`}
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
