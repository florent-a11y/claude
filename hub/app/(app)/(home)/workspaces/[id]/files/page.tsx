import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Folder, FolderOpen, Image as ImageIcon, Trash2 } from "lucide-react";
import { isInternal, requireUser } from "@/lib/auth";
import { getWorkspaceForUser } from "@/lib/queries/workspaces";
import { listFolders, listWorkspaceFiles } from "@/lib/queries/files";
import { deleteFile } from "@/lib/actions/files";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { InternalBadge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { formatBytes, formatDateTime } from "@/lib/format";
import { UploadForm } from "./UploadForm";

export const metadata = { title: "Files" };

export default async function WorkspaceFilesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ folder?: string }> }) {
  const { id } = await params;
  const { folder } = await searchParams;
  const user = await requireUser();
  const ws = getWorkspaceForUser(id, user);
  if (!ws) notFound();
  const internal = isInternal(user);
  const folders = listFolders(id, user);
  const files = listWorkspaceFiles(id, user, folder);
  const total = folders.reduce((n, f) => n + f.n, 0);

  return (
    <div className="space-y-4 px-5 pb-6 pt-4">
      <div className="flex flex-wrap gap-1.5">
        <Link href={`/workspaces/${id}/files`} className={`badge ring-1 ${folder === undefined ? "bg-indigo-50 text-indigo-700 ring-indigo-200" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}><FolderOpen className="h-3.5 w-3.5" /> All files <span className="text-slate-400">{total}</span></Link>
        {folders.map((f) => (
          <Link key={f.folder || "_root"} href={`/workspaces/${id}/files?folder=${encodeURIComponent(f.folder)}`} className={`badge ring-1 ${folder === f.folder ? "bg-indigo-50 text-indigo-700 ring-indigo-200" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
            <Folder className="h-3.5 w-3.5" /> {f.folder || "Unsorted"} <span className="text-slate-400">{f.n}</span>
          </Link>
        ))}
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-slate-500">{folder !== undefined ? `Folder: ${folder || "Unsorted"}` : "All files shared in this workspace."}</p>
          <UploadForm workspaceId={id} folders={folders.map((f) => f.folder).filter(Boolean)} canInternal={internal} />
        </div>
        {files.length === 0 ? (
          <EmptyState icon={FileText} title="No files here yet" hint="Upload deliverables, contracts and documents. Files attached in the conversation also appear here." />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  {f.mime.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/api/files/${f.id}`} className="truncate text-sm font-medium text-slate-900 hover:text-indigo-700" download>{f.name}</a>
                    {!!f.internal && <InternalBadge />}
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatBytes(f.size)} · {f.folder || "Unsorted"} · {formatDateTime(f.created_at)}
                    {f.uploader_name && <> · <Avatar name={f.uploader_name} color={f.uploader_color} size="xs" className="mx-1 align-middle" />{f.uploader_name}</>}
                  </p>
                </div>
                <a href={`/api/files/${f.id}`} className="btn btn-ghost btn-sm px-2" title="Download" download><Download className="h-4 w-4" /></a>
                {(internal || f.uploader_id === user.id) && (
                  <form action={deleteFile.bind(null, f.id)}>
                    <ConfirmButton message={`Delete ${f.name}?`} className="btn btn-ghost btn-sm px-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
