"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { uploadFiles } from "@/lib/actions/files";
import { idle } from "@/lib/actions/state";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export function UploadForm({ workspaceId, folders, canInternal }: { workspaceId: string; folders: string[]; canInternal: boolean }) {
  const [state, action] = useActionState(uploadFiles.bind(null, workspaceId), idle);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm"><Upload className="h-4 w-4" /> Upload files</button>;
  return (
    <form ref={ref} action={action} className="card w-full space-y-3 p-4">
      <div>
        <label className="label">Files</label>
        <input name="files" type="file" multiple required className="input" />
        <p className="mt-1 text-xs text-slate-400">Up to 50 MB per file.</p>
      </div>
      <div>
        <label className="label">Folder (optional)</label>
        <input name="folder" list={`folders-${workspaceId}`} className="input" placeholder="e.g. Contracts, Deliverables, Invoices" />
        <datalist id={`folders-${workspaceId}`}>{folders.map((f) => <option key={f} value={f} />)}</datalist>
      </div>
      {canInternal && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="internal" className="rounded border-slate-300" /> Internal (hidden from clients)
        </label>
      )}
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
        <SubmitButton className="btn btn-primary btn-sm" pendingText="Uploading…">Upload</SubmitButton>
      </div>
    </form>
  );
}
