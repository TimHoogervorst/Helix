import type { ReactNode } from "react";

interface TableChromeProps {
  title: ReactNode;
  toolbar?: ReactNode;
  addRow?: ReactNode;
  addRowOutside?: boolean;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function TableChrome({
  title,
  toolbar,
  addRow,
  addRowOutside = false,
  children,
  className = "",
  ...props
}: TableChromeProps) {
  return (
    <>
      <section className={`table-layout-chrome ${className}`} {...props}>
        <header className="table-layout-chrome__bar">
          <h3 className="table-layout-chrome__title">{title}</h3>
          {toolbar && <div className="table-layout-chrome__toolbar">{toolbar}</div>}
        </header>
        {children}
        {addRow && !addRowOutside && (
          <div className="table-layout-chrome__add-row">{addRow}</div>
        )}
      </section>
      {addRow && addRowOutside && (
        <div className="table-layout-chrome__add-row">{addRow}</div>
      )}
    </>
  );
}
