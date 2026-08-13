/**
 * useEntryFolder — folder listing and selection for the ELN editor.
 *
 * Owns: the folder list (fetched once on mount) and the selected folderId.
 */
import { useState, useEffect } from "react";
import { get } from "../../../shell/src/api/client";

export interface Folder {
  id: number;
  name: string;
  path?: string;
}

export interface UseEntryFolderOptions {
  initialFolderId?: number | null;
  projectId?: number | null;
  projectUid?: string | null;
}

export interface UseEntryFolderReturn {
  folderId: number | null;
  setFolderId: (id: number | null) => void;
  folders: Folder[];
}

export function useEntryFolder({
  initialFolderId,
  projectId,
  projectUid,
}: UseEntryFolderOptions = {}): UseEntryFolderReturn {
  const [folderId, setFolderId] = useState<number | null>(
    initialFolderId ?? null,
  );
  const [folders, setFolders] = useState<Folder[]>([]);

  // Entry data loads after the hook is mounted, so initialize the selected
  // folder when its fallback value becomes available. Do not overwrite an
  // explicit selection, including a user clearing the folder.
  useEffect(() => {
    if (initialFolderId === null || initialFolderId === undefined) return;
    setFolderId((current) => current ?? initialFolderId);
  }, [initialFolderId]);

  // ── Fetch folders ──
  useEffect(() => {
    setFolders([]);
    const query = projectUid
      ? `/library/folders/?project=${encodeURIComponent(projectUid)}`
      : projectId === null || projectId === undefined
        ? "/core/folders/"
        : `/core/folders/?project=${projectId}`;
    get<Folder[]>(query)
      .then(setFolders)
      .catch(() => {});
  }, [projectId]);

  return { folderId, setFolderId, folders };
}
