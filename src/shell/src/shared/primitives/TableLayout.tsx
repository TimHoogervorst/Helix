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

export function TableChrome({
  title,
  toolbar,
  addRow,
  children,
  className = "",
  ...props
}: LayoutProps & {
  title: ReactNode;
  toolbar?: ReactNode;
  addRow?: ReactNode;
}) {
  return (
    <section className={`table-layout-chrome ${className}`} {...props}>
      <header className="table-layout-chrome__bar">
        <h3 className="table-layout-chrome__title">{title}</h3>
        {toolbar && <div className="table-layout-chrome__toolbar">{toolbar}</div>}
      </header>
      {children}
      {addRow && <div className="table-layout-chrome__add-row">{addRow}</div>}
    </section>
  );
}
