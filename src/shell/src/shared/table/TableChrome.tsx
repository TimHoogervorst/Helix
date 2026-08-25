import { cloneElement, isValidElement, type ReactNode } from "react";

interface TableChromeProps {
  title: ReactNode;
  toolbar?: ReactNode;
  addRow?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function TableChrome({
  title,
  toolbar,
  addRow,
  children,
  className = "",
  ...props
}: TableChromeProps) {
  const viewport = isValidElement(children)
    ? cloneElement(children, {
        "data-bleed-role": "viewport",
        className: `${(children.props as { className?: string }).className ?? ""} ${className}`.trim(),
      } as Record<string, unknown>)
    : children;

  return (
    <>
      <section className={`table-layout-chrome ${className}`} data-bleed-role="card" {...props} />
      <header className={`table-layout-chrome__bar ${className}`} data-bleed-role="bar">
        <h3 className="table-layout-chrome__title">{title}</h3>
        {toolbar && <div className="table-layout-chrome__toolbar">{toolbar}</div>}
      </header>
      {viewport}
      {addRow && <div className={`table-layout-chrome__add-row ${className}`} data-bleed-role="add-row">{addRow}</div>}
    </>
  );
}
