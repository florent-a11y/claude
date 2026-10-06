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
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState(0);
  const ref = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const acceptDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!e.dataTransfer.files.length) return;
    setOpen(true);
    // the input mounts on the next render when the form was closed
    setTimeout(() => {
      if (fileRef.current) {
        fileRef.current.files = e.dataTransfer.files;
        setPicked(e.dataTransfer.files.length);
      }
    }, 0);
  };
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={acceptDrop} className={`rounded-lg transition ${over ? "ring-2 ring-indigo-400 ring-offset-2" : ""}`}>
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm"><Upload className="h-4 w-4" /> Upload files</button>
      </div>
    );
  }
  return (
    <form ref={ref} action={action} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={acceptDrop} className={`card w-full space-y-3 p-4 transition ${over ? "border-indigo-400 bg-indigo-50/40" : ""}`}>
      <div>
        <label className="label">Files</label>
        <input ref={fileRef} name="files" type="file" multiple required className="input" onChange={(e) => setPicked(e.target.files?.length ?? 0)} />
        <p className="mt-1 text-xs text-slate-400">{picked ? `${picked} file${picked === 1 ? "" : "s"} selected · ` : ""}Drop files anywhere on this box. Up to 50 MB per file.</p>
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
