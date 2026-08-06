import { useState, type ReactNode } from "react";
import {
  Settings,
  Trash2,
  MoreHorizontal,
  Plus,
  Bold,
  Italic,
  List,
} from "lucide-react";
import { applyThemeSeeds, DEFAULT_SEEDS } from "../shared/applyThemeSeeds";
import {
  Button,
  IconButton,
  Input,
  Textarea,
  Select,
  Collapsible,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableCell,
  TabBar,
  Modal,
  Menu,
  Badge,
} from "../shared/primitives";
import type { Tab } from "../shared/primitives";

const CODE_TABS: Tab[] = [
  { id: "editor", label: "Editor" },
  { id: "preview", label: "Preview" },
  { id: "history", label: "History" },
];

function SeedSwitcher() {
  const [seeds, setSeeds] = useState(DEFAULT_SEEDS);

  const handleChange = (key: keyof typeof seeds, value: string) => {
    const next = { ...seeds, [key]: value };
    setSeeds(next);
    applyThemeSeeds(next);
  };

  const reset = () => {
    setSeeds(DEFAULT_SEEDS);
    applyThemeSeeds(DEFAULT_SEEDS);
  };

  const fields: { key: keyof typeof seeds; label: string }[] = [
    { key: "background", label: "Background" },
    { key: "surface", label: "Surface" },
    { key: "ink", label: "Ink" },
    { key: "primary", label: "Primary" },
    { key: "accent", label: "Accent" },
  ];

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] p-5">
      {fields.map((f) => (
        <label
          key={f.key}
          className="flex flex-col gap-1 min-w-[140px] flex-1"
        >
          <span className="font-[var(--font-label)] text-[10px] uppercase tracking-wider text-[var(--color-ink-muted-foreground)]">
            {f.label}
          </span>
          <div className="flex items-center gap-1.5">
            <div
              className="h-8 w-8 shrink-0 rounded border border-[var(--color-ink-hairline)]"
              style={{ background: seeds[f.key] }}
            />
            <input
              type="text"
              className="flex-1 h-8 rounded border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 font-[var(--font-label)] text-[11px] text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
              value={seeds[f.key]}
              onChange={(e) => handleChange(f.key, e.target.value)}
            />
          </div>
        </label>
      ))}
      <Button variant="ghost" size="sm" onClick={reset}>
        Reset Defaults
      </Button>
    </div>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="font-[var(--font-label)] text-[var(--text-2xl)] font-semibold tracking-tight text-[var(--color-ink)]">
      {children}
    </h2>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-ink-hairline)] bg-[var(--color-surface)] p-5">
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: string }) {
  return (
    <h3 className="font-[var(--font-label)] text-[11px] uppercase tracking-wider text-[var(--color-ink-muted-foreground)] mb-4">
      {children}
    </h3>
  );
}

function Grid({
  children,
  cols = 3,
}: {
  children: ReactNode;
  cols?: number;
}) {
  return (
    <div
      className={`grid gap-4`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export default function PrototypePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("editor");
  const [selectValue, setSelectValue] = useState("option1");

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-8 py-10 space-y-12">
          {/* ── Hero ── */}
          <div>
            <span className="text-eyebrow">Prototype</span>
            <h1 className="text-title mt-1">Design-System Gallery</h1>
            <p className="mt-2 font-[var(--font-body)] text-[13px] text-[var(--color-ink-muted-foreground)] max-w-2xl">
              Every primitive, variant, size, and state. The seed switcher
              below live-applies theme changes — this is the alignment surface
              for issues #415/#416. This page is throwaway code.
            </p>
          </div>

          {/* ── Seed Switcher ── */}
          <div>
            <SectionHeading>Theme Seeds</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Derived shades recompute live. Drag the colour pickers or edit
              the OKLCH values directly.
            </p>
            <SeedSwitcher />
          </div>

          {/* ── Titles ── */}
          <div>
            <SectionHeading>Titles</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Label-role heroes (mono) vs Body-role entry titles (sans).
            </p>
            <Grid cols={2}>
              <Card>
                <CardTitle>Label Hero (mono, left-align)</CardTitle>
                <div className="space-y-4">
                  <div>
                    <span className="font-[var(--font-label)] text-[10px] uppercase tracking-widest text-[var(--color-ink-muted-foreground)]">
                      Settings
                    </span>
                    <h2 className="font-[var(--font-label)] text-[var(--text-3xl)] font-semibold tracking-tight text-[var(--color-ink)] leading-tight mt-1">
                      Protocol Templates
                    </h2>
                    <p className="font-[var(--font-body)] text-[13px] text-[var(--color-ink-muted-foreground)] mt-1.5">
                      Define reusable step sequences for your notebook entries
                      using the Label (mono) voice for UI chrome.
                    </p>
                  </div>
                  <div>
                    <span className="font-[var(--font-label)] text-[10px] uppercase tracking-widest text-[var(--color-ink-muted-foreground)]">
                      Library
                    </span>
                    <h2 className="font-[var(--font-label)] text-[var(--text-xl)] font-semibold tracking-tight text-[var(--color-ink)] leading-tight mt-1">
                      Polyclonal Antibody Production
                    </h2>
                    <p className="font-[var(--font-body)] text-[13px] text-[var(--color-ink-muted-foreground)] mt-1.5">
                      This is the Label voice applied to a page title — the
                      mono font gives a lab-console feel.
                    </p>
                  </div>
                </div>
              </Card>
              <Card>
                <CardTitle>Body Entry Title (sans, right-align)</CardTitle>
                <div className="space-y-4">
                  <div>
                    <span className="font-[var(--font-label)] text-[10px] uppercase tracking-widest text-[var(--color-ink-muted-foreground)]">
                      Aug 6, 2026
                    </span>
                    <h3 className="font-[var(--font-body)] text-[var(--text-2xl)] font-semibold text-[var(--color-ink)] leading-tight mt-1">
                      Western Blot — Anti-GFP on HEK293 lysate
                    </h3>
                    <p className="font-[var(--font-body)] text-[13px] text-[var(--color-ink-muted-foreground)] mt-1.5">
                      Content names use the Body (Inter) voice — this is an
                      entry title, not UI chrome.
                    </p>
                  </div>
                  <div>
                    <span className="font-[var(--font-label)] text-[10px] uppercase tracking-widest text-[var(--color-ink-muted-foreground)]">
                      Jul 12, 2026
                    </span>
                    <h3 className="font-[var(--font-body)] text-[var(--text-lg)] font-semibold text-[var(--color-ink)] leading-tight mt-1">
                      Plasmid midiprep — pET28a-GFP
                    </h3>
                    <p className="font-[var(--font-body)] text-[13px] text-[var(--color-ink-muted-foreground)] mt-1.5">
                      Body titles are at home in the editor narrative, card
                      headers, and lists of named content.
                    </p>
                  </div>
                </div>
              </Card>
            </Grid>
          </div>

          {/* ── Buttons ── */}
          <div>
            <SectionHeading>Button</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Variants: primary, ghost, destructive. Sizes: sm, md. States:
              default, hover, active, disabled, focus-visible.
            </p>
            <Grid cols={2}>
              <Card>
                <CardTitle>Primary — md</CardTitle>
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="primary" size="md">
                    Save Changes
                  </Button>
                  <Button variant="primary" size="md" disabled>
                    Disabled
                  </Button>
                  <Button variant="primary" size="md">
                    <Plus size={14} />
                    With Icon
                  </Button>
                </div>
              </Card>
              <Card>
                <CardTitle>Primary — sm</CardTitle>
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="primary" size="sm">
                    Save
                  </Button>
                  <Button variant="primary" size="sm" disabled>
                    Disabled
                  </Button>
                  <Button variant="primary" size="sm">
                    <Plus size={12} />
                    Icon
                  </Button>
                </div>
              </Card>
              <Card>
                <CardTitle>Ghost — md</CardTitle>
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="ghost" size="md">
                    Cancel
                  </Button>
                  <Button variant="ghost" size="md" disabled>
                    Disabled
                  </Button>
                  <Button variant="ghost" size="md">
                    <Settings size={14} />
                    Options
                  </Button>
                </div>
              </Card>
              <Card>
                <CardTitle>Ghost — sm</CardTitle>
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="ghost" size="sm">
                    Cancel
                  </Button>
                  <Button variant="ghost" size="sm" disabled>
                    Disabled
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Settings size={12} />
                    Edit
                  </Button>
                </div>
              </Card>
              <Card>
                <CardTitle>Destructive — md</CardTitle>
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="destructive" size="md">
                    Delete
                  </Button>
                  <Button variant="destructive" size="md" disabled>
                    Disabled
                  </Button>
                  <Button variant="destructive" size="md">
                    <Trash2 size={14} />
                    Remove
                  </Button>
                </div>
              </Card>
              <Card>
                <CardTitle>Destructive — sm</CardTitle>
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                  <Button variant="destructive" size="sm" disabled>
                    Disabled
                  </Button>
                  <Button variant="destructive" size="sm">
                    <Trash2 size={12} />
                    Del
                  </Button>
                </div>
              </Card>
            </Grid>
          </div>

          {/* ── IconButton ── */}
          <div>
            <SectionHeading>IconButton</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Square icon-only button. States: default, hover, active,
              disabled.
            </p>
            <Card>
              <CardTitle>All states</CardTitle>
              <div className="flex flex-wrap items-end gap-2">
                <IconButton aria-label="Settings">
                  <Settings size={16} />
                </IconButton>
                <IconButton aria-label="Bold">
                  <Bold size={16} />
                </IconButton>
                <IconButton aria-label="Italic">
                  <Italic size={16} />
                </IconButton>
                <IconButton aria-label="List">
                  <List size={16} />
                </IconButton>
                <IconButton aria-label="More">
                  <MoreHorizontal size={16} />
                </IconButton>
                <IconButton aria-label="Disabled" disabled>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </Card>
          </div>

          {/* ── Input / Textarea / Select ── */}
          <div>
            <SectionHeading>Input / Textarea / Select</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Form fields with focus ring and disabled state.
            </p>
            <Grid cols={2}>
              <Card>
                <CardTitle>Input</CardTitle>
                <div className="space-y-3">
                  <div>
                    <label className="block font-[var(--font-label)] text-[11px] font-medium text-[var(--color-ink)] mb-1">
                      Name
                    </label>
                    <Input placeholder="Enter a name" />
                  </div>
                  <div>
                    <label className="block font-[var(--font-label)] text-[11px] font-medium text-[var(--color-ink)] mb-1">
                      Email (disabled)
                    </label>
                    <Input placeholder="email@example.com" disabled />
                  </div>
                  <div>
                    <label className="block font-[var(--font-label)] text-[11px] font-medium text-[var(--color-ink)] mb-1">
                      With value
                    </label>
                    <Input defaultValue="pET28a-GFP" />
                  </div>
                </div>
              </Card>
              <Card>
                <CardTitle>Textarea</CardTitle>
                <div className="space-y-3">
                  <div>
                    <label className="block font-[var(--font-label)] text-[11px] font-medium text-[var(--color-ink)] mb-1">
                      Description
                    </label>
                    <Textarea placeholder="Enter a description…" />
                  </div>
                  <div>
                    <label className="block font-[var(--font-label)] text-[11px] font-medium text-[var(--color-ink)] mb-1">
                      Disabled
                    </label>
                    <Textarea
                      defaultValue="This field cannot be edited."
                      disabled
                    />
                  </div>
                </div>
              </Card>
              <Card>
                <CardTitle>Select</CardTitle>
                <div className="space-y-3">
                  <div>
                    <label className="block font-[var(--font-label)] text-[11px] font-medium text-[var(--color-ink)] mb-1">
                      Priority
                    </label>
                    <Select
                      value={selectValue}
                      onChange={(e) => setSelectValue(e.target.value)}
                    >
                      <option value="option1">Western Blot</option>
                      <option value="option2">qPCR</option>
                      <option value="option3">ELISA</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block font-[var(--font-label)] text-[11px] font-medium text-[var(--color-ink)] mb-1">
                      Disabled
                    </label>
                    <Select disabled>
                      <option>Not available</option>
                    </Select>
                  </div>
                </div>
              </Card>
            </Grid>
          </div>

          {/* ── Collapsible ── */}
          <div>
            <SectionHeading>Collapsible</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Toggle section. Default collapsed or open.
            </p>
            <Grid cols={2}>
              <Card>
                <CardTitle>Default closed</CardTitle>
                <Collapsible title="Advanced Settings">
                  <p className="font-[var(--font-body)] text-[13px] text-[var(--color-ink-muted-foreground)]">
                    These settings are hidden by default. Click the header to
                    expand.
                  </p>
                  <div className="mt-3">
                    <Input placeholder="API Endpoint URL" />
                  </div>
                </Collapsible>
              </Card>
              <Card>
                <CardTitle>Default open</CardTitle>
                <Collapsible title="Protocol Steps" defaultOpen>
                  <p className="font-[var(--font-body)] text-[13px] text-[var(--color-ink-muted-foreground)]">
                    This section starts expanded so important content is
                    visible immediately.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="primary" size="sm">
                      Add Step
                    </Button>
                    <Button variant="ghost" size="sm">
                      Import
                    </Button>
                  </div>
                </Collapsible>
              </Card>
            </Grid>
          </div>

          {/* ── Table ── */}
          <div>
            <SectionHeading>Table Family</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Presentational, composable. Not a data-table component.
            </p>
            <Card>
              <CardTitle>Sample data table</CardTitle>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <tbody>
                  <TableRow>
                    <TableCell>
                      <span className="font-[var(--font-body)] font-semibold">
                        pET28a-GFP
                      </span>
                    </TableCell>
                    <TableCell>Plasmid</TableCell>
                    <TableCell>
                      <Badge variant="success">Ready</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-[var(--font-label)] text-[12px] text-[var(--color-ink-muted-foreground)]">
                        Aug 6, 2026
                      </span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <span className="font-[var(--font-label)] font-semibold">
                        AB-001
                      </span>
                    </TableCell>
                    <TableCell>Antibody</TableCell>
                    <TableCell>
                      <Badge variant="warning">Pending</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-[var(--font-label)] text-[12px] text-[var(--color-ink-muted-foreground)]">
                        Jul 28, 2026
                      </span>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <span className="font-[var(--font-label)] font-semibold">
                        HEK293-WT
                      </span>
                    </TableCell>
                    <TableCell>Cell Line</TableCell>
                    <TableCell>
                      <Badge variant="neutral">Archived</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-[var(--font-label)] text-[12px] text-[var(--color-ink-muted-foreground)]">
                        Jun 15, 2026
                      </span>
                    </TableCell>
                  </TableRow>
                </tbody>
              </Table>
            </Card>
          </div>

          {/* ── TabBar ── */}
          <div>
            <SectionHeading>TabBar</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Horizontal tab navigation with active underline.
            </p>
            <Card>
              <CardTitle>Code tabs (Label font)</CardTitle>
              <TabBar
                tabs={CODE_TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
              <div className="mt-4 p-4 rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-background)]">
                <p className="font-[var(--font-label)] text-[12px] text-[var(--color-ink-muted-foreground)]">
                  Active tab:{" "}
                  <span className="text-[var(--color-ink)] font-semibold">
                    {activeTab}
                  </span>
                </p>
              </div>
            </Card>
          </div>

          {/* ── Modal ── */}
          <div>
            <SectionHeading>Modal</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Centered dialog with overlay backdrop. ESC or click-outside to
              close.
            </p>
            <Card>
              <CardTitle>Trigger</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setModalOpen(true)}
                >
                  Open Modal
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setModalOpen(true)}
                >
                  Open via Ghost
                </Button>
              </div>
              <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Delete Entry"
              >
                <p className="font-[var(--font-body)] text-[13px] text-[var(--color-ink)] mb-4">
                  Are you sure you want to delete{" "}
                  <strong>Western Blot — Anti-GFP</strong>? This action cannot
                  be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                  >
                    Delete
                  </Button>
                </div>
              </Modal>
            </Card>
          </div>

          {/* ── Menu ── */}
          <div>
            <SectionHeading>Menu</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Dropdown menu with danger items and disabled state. Click outside
              or ESC to close.
            </p>
            <Card>
              <CardTitle>Dropdown</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Menu
                  trigger={
                    <Button variant="ghost" size="md">
                      <MoreHorizontal size={14} />
                      Actions
                    </Button>
                  }
                  items={[
                    {
                      id: "edit",
                      label: "Edit",
                      onSelect: () => {},
                    },
                    {
                      id: "duplicate",
                      label: "Duplicate",
                      onSelect: () => {},
                    },
                    {
                      id: "archive",
                      label: "Archive",
                      disabled: true,
                      onSelect: () => {},
                    },
                    {
                      id: "delete",
                      label: "Delete",
                      danger: true,
                      onSelect: () => {},
                    },
                  ]}
                />
                <Menu
                  trigger={
                    <IconButton aria-label="More options">
                      <MoreHorizontal size={16} />
                    </IconButton>
                  }
                  items={[
                    {
                      id: "rename",
                      label: "Rename",
                      onSelect: () => {},
                    },
                    {
                      id: "share",
                      label: "Share",
                      onSelect: () => {},
                    },
                    {
                      id: "remove",
                      label: "Remove",
                      danger: true,
                      onSelect: () => {},
                    },
                  ]}
                />
              </div>
            </Card>
          </div>

          {/* ── Badge ── */}
          <div>
            <SectionHeading>Badge</SectionHeading>
            <p className="text-meta mt-1 mb-4">
              Variants: neutral, primary, success, warning, destructive.
            </p>
            <Card>
              <CardTitle>All variants</CardTitle>
              <div className="flex flex-wrap items-end gap-2">
                <Badge variant="neutral">Draft</Badge>
                <Badge variant="primary">12 items</Badge>
                <Badge variant="success">Complete</Badge>
                <Badge variant="warning">Review</Badge>
                <Badge variant="destructive">Failed</Badge>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
