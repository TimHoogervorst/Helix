# Table click selects, not edits

Table cells originally entered edit mode on a single click. Multi-cell selection (drag marquee, Shift-click, Ctrl-click) is incompatible with click-to-edit — the editor would open at the drag origin and steal focus — so all table cells now follow spreadsheet click semantics: a single click selects, and editing starts via double-click, Enter, or F2. This deliberately reverses the earlier behavior and applies to every table block built on the Table Kit; boolean cells keep direct toggle-on-click as the single exception.
