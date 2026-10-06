import { all, one } from "../db";
import { isInternal } from "../auth";
import type { FileRow, FileWithMeta, PublicUser } from "../types";

const BASE = `SELECT f.*, u.name AS uploader_name, u.color AS uploader_color FROM files f LEFT JOIN users u ON u.id = f.uploader_id`;

export function listWorkspaceFiles(workspaceId: string, user: PublicUser, folder?: string): FileWithMeta[] {
  const vis = isInternal(user) ? "" : "AND f.internal = 0";
  if (folder !== undefined) {
    return all<FileWithMeta>(`${BASE} WHERE f.workspace_id = ? AND f.folder = ? ${vis} ORDER BY f.created_at DESC`, workspaceId, folder);
  }
  return all<FileWithMeta>(`${BASE} WHERE f.workspace_id = ? ${vis} ORDER BY f.folder, f.created_at DESC`, workspaceId);
}

export function listFolders(workspaceId: string, user: PublicUser): { folder: string; n: number }[] {
  const vis = isInternal(user) ? "" : "AND f.internal = 0";
  return all<{ folder: string; n: number }>(
    `SELECT f.folder, COUNT(*) AS n FROM files f WHERE f.workspace_id = ? ${vis} GROUP BY f.folder ORDER BY f.folder`,
    workspaceId,
  );
}

export function getFile(id: string): FileRow | undefined {
  return one<FileRow>("SELECT * FROM files WHERE id = ?", id);
}

export function countWorkspaceFiles(workspaceId: string, user: PublicUser): number {
  const vis = isInternal(user) ? "" : "AND internal = 0";
  return one<{ n: number }>(`SELECT COUNT(*) AS n FROM files WHERE workspace_id = ? ${vis}`, workspaceId)!.n;
}
