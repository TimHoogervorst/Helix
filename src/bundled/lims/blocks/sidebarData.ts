export interface LimsEditorContext {
  projectId?: number | null;
  folderId?: number | null;
  entry?: { id?: number; project?: number | null } | null;
}
