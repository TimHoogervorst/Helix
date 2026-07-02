import { useParams } from "react-router-dom";
import { useRef, useState, useCallback } from "react";
import {
  History,
  MessageSquare,
  Star,
  Share2,
  CircleCheck,
  Lock,
  Folder,
  ChevronRight,
  Save,
  Pencil,
  Trash2,
  X,
  Dna,
  FlaskConical,
  Beaker,
  Paperclip,
} from "lucide-react";
import ElnEditor from "../components/ElnEditor";
import type { ElnEditorHandle, ElnEditorState } from "../components/ElnEditor";

/** Placeholder icon button with tooltip — all wired in future PRDs.
 *  Uses .btn-icon so the global button background is properly overridden. */
function IconButton({
  icon: Icon,
  label,
  tooltip,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="btn-icon rounded-md"
      aria-label={label}
      title={tooltip}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/** Hardcoded user avatar circle — real user data in future PRD. */
function Avatar({
  initials,
  bgClass,
}: {
  initials: string;
  bgClass: string;
}) {
  return (
    <span
      className={`inline-grid h-6 w-6 shrink-0 place-items-center rounded-full ${bgClass} font-mono text-[9.5px] font-medium ring-2 ring-background`}
    >
      {initials}
    </span>
  );
}

function ElnDetail() {
  const { id } = useParams<{ id: string }>();
  const entryDisplayId = id ?? "New";

  // ── Editor state lifted from ElnEditor via callback ──
  const [editorState, setEditorState] = useState<ElnEditorState>({
    mode: "loading",
    isEdit: false,
    isSaving: false,
    isDirty: false,
    deleting: false,
  });
  const handleStateChange = useCallback((state: ElnEditorState) => {
    setEditorState(state);
  }, []);

  // ── Editor actions exposed via ref ──
  const editorRef = useRef<ElnEditorHandle>(null);

  const showActions =
    editorState.mode !== "loading" && editorState.mode !== "error";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* ── Top toolbar ── */}
      <div className="flex items-center justify-between border-b border-hairline px-6 py-2.5">
        {/* Left: breadcrumbs + status */}
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Folder
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <span>CRISPR-Cas9 Optimization</span>
          <ChevronRight
            className="h-3.5 w-3.5 text-muted-foreground/60"
            aria-hidden="true"
          />
          <span className="font-medium text-foreground">
            {entryDisplayId}
          </span>

          {/* Status badge */}
          <span className="ml-3 inline-flex items-center gap-1 rounded border border-hairline bg-panel px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
            Draft
          </span>
        </div>

        {/* Right: actions + avatars + share */}
        <div className="flex items-center gap-1">
          {/* ── Editor action buttons (lifted from ElnEditor) ── */}
          {showActions &&
            (editorState.isEdit ? (
              <>
                <IconButton
                  icon={Save}
                  label="Save"
                  tooltip="Save entry"
                  disabled={editorState.isSaving}
                  onClick={() => editorRef.current?.save()}
                />
                <IconButton
                  icon={X}
                  label="Cancel"
                  tooltip="Cancel editing"
                  disabled={editorState.isSaving}
                  onClick={() => editorRef.current?.cancel()}
                />
              </>
            ) : (
              <>
                <IconButton
                  icon={Pencil}
                  label="Edit"
                  tooltip="Edit entry"
                  onClick={() => editorRef.current?.enterEditMode()}
                />
                <IconButton
                  icon={Trash2}
                  label="Delete"
                  tooltip="Delete entry"
                  disabled={editorState.deleting}
                  onClick={() => editorRef.current?.deleteEntry()}
                />
              </>
            ))}

          <IconButton
            icon={History}
            label="History"
            tooltip="Placeholder — version history coming soon"
          />
          <IconButton
            icon={MessageSquare}
            label="Comments"
            tooltip="Placeholder — comments coming soon"
          />
          <IconButton
            icon={Star}
            label="Star"
            tooltip="Placeholder — bookmark coming soon"
          />

          {/* Separator */}
          <div className="mx-1.5 h-4 w-px bg-hairline" aria-hidden="true" />

          {/* User avatars */}
          <div className="flex -space-x-1.5">
            <Avatar initials="MK" bgClass="bg-enzyme text-enzyme-foreground" />
            <Avatar initials="JS" bgClass="bg-flask text-flask-foreground" />
            <Avatar initials="AR" bgClass="bg-solvent text-solvent-foreground" />
          </div>

          {/* Share button */}
          <button
            className="ml-2 flex items-center gap-1.5 rounded-md border border-hairline bg-panel px-2.5 py-1 text-[12px] hover:bg-muted"
            aria-label="Share"
            title="Placeholder — sharing coming soon"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Share
          </button>

          {/* Sign & Witness button */}
          <button
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90"
            aria-label="Sign & Witness"
            title="Placeholder — sign & witness coming soon"
          >
            <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Sign &amp; witness
          </button>
        </div>
      </div>

      {/* ── Content + Metadata ── */}
      <div className="flex min-w-0 flex-1">
        {/* Main content area */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-3xl px-6 pb-24 pt-8">
            <ElnEditor entryId={id} ref={editorRef} onStateChange={handleStateChange} />
          </div>
        </main>

        {/* Metadata panel — visible at xl and above */}
        <aside className="hidden w-72 shrink-0 border-l border-hairline bg-surface/60 xl:block">
          <div className="sticky top-0 max-h-screen space-y-6 overflow-y-auto px-5 py-6">
            {/* ── Metadata ── */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Metadata
              </h3>
              <dl className="space-y-2.5 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="text-right">Dr. Mira Kato</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Witness</dt>
                  <dd className="text-right italic text-muted-foreground">
                    Pending — J. Silva
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Project</dt>
                  <dd className="text-right">CRISPR-Cas9 Opt.</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="text-right">2026-06-28 09:14</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Instrument</dt>
                  <dd className="text-right">Nanodrop One · Bio-Rad C1000</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-right">
                    <span className="inline-flex items-center gap-1 rounded border border-hairline bg-warn px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn-foreground">
                      In progress
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            {/* ── Linked entities ── */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Linked entities
              </h3>
              <div className="space-y-1.5 text-[13px]">
                <button
                  className="flex w-full items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-left hover:bg-background"
                  aria-label="View EMX1 gene"
                  title="Placeholder — entity navigation coming soon"
                >
                  <Dna className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">EMX1 gene</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    GENE-EMX1
                  </span>
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-left hover:bg-background"
                  aria-label="View HEK293T · WT"
                  title="Placeholder — entity navigation coming soon"
                >
                  <FlaskConical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">HEK293T · WT</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    CELL-0012
                  </span>
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-left hover:bg-background"
                  aria-label="View Plate P-24-118"
                  title="Placeholder — entity navigation coming soon"
                >
                  <Beaker className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">Plate P-24-118</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    PLT-118
                  </span>
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-left hover:bg-background"
                  aria-label="View Cas9-HF1 stock"
                  title="Placeholder — entity navigation coming soon"
                >
                  <FlaskConical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">Cas9-HF1 stock</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    REG-1042
                  </span>
                </button>
              </div>
            </section>

            {/* ── Attachments ── */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Attachments
              </h3>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono">raw_gel_2026-06-30.tif</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">4.2 MB</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono">plate_layout.xlsx</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">18 KB</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-hairline bg-panel px-2.5 py-1.5">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono">sequencing_reads.fastq.gz</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">112 MB</span>
                </div>
              </div>
            </section>

            {/* ── Activity ── */}
            <section>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Activity
              </h3>
              <ul className="space-y-2 text-[12px]">
                <li className="flex items-start gap-2">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
                    aria-hidden="true"
                    data-testid="activity-dot"
                  />
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Mira K.
                    </span>{" "}
                    added bar chart FIG-01
                  </span>
                  <span className="shrink-0 text-muted-foreground/70">
                    · 14 min ago
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
                    aria-hidden="true"
                    data-testid="activity-dot"
                  />
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Jordan S.
                    </span>{" "}
                    commented on g4 dropout
                  </span>
                  <span className="shrink-0 text-muted-foreground/70">
                    · 2 h ago
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
                    aria-hidden="true"
                    data-testid="activity-dot"
                  />
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Mira K.
                    </span>{" "}
                    linked reagent REG-1042
                  </span>
                  <span className="shrink-0 text-muted-foreground/70">
                    · 5 h ago
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
                    aria-hidden="true"
                    data-testid="activity-dot"
                  />
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    <span className="font-medium text-foreground">
                      System
                    </span>{" "}
                    autosaved v0.4
                  </span>
                  <span className="shrink-0 text-muted-foreground/70">
                    · just now
                  </span>
                </li>
              </ul>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ElnDetail;
