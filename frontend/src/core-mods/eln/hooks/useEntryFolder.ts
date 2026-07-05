/**
 * useEntryFolder — folder listing and selection for the ELN editor.
 *
 * Owns: the folder list (fetched once on mount) and the selected folderId.
 */
import { useState, useEffect } from "react";
import { get } from "../../../core/api/client";

export interface Folder {
  id: number;
  name: string;
}

export interface UseEntryFolderOptions {
  initialFolderId?: number | null;
}

export interface UseEntryFolderReturn {
  folderId: number | null;
  setFolderId: (id: number | null) => void;
  folders: Folder[];
}

export function useEntryFolder({
  initialFolderId,
}: UseEntryFolderOptions = {}): UseEntryFolderReturn {
  const [folderId, setFolderId] = useState<number | null>(
    initialFolderId ?? null,
  );
  const [folders, setFolders] = useState<Folder[]>([]);

  // ── Fetch folders ──
  useEffect(() => {
    get<Folder[]>("/core/folders/")
      .then(setFolders)
      .catch(() => {});
  }, []);

  return { folderId, setFolderId, folders };
}
