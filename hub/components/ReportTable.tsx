export function ReportTable({ columns, children, empty }: { columns: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>{columns.map((c) => <th key={c} className="border-b border-slate-200 px-4 py-2.5">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {empty ? <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">Nothing to show.</td></tr> : children}
        </tbody>
      </table>
    </div>
  );
}

export function ReportHeader({ title, count, actions, filters }: { title: string; count?: number; actions?: React.ReactNode; filters?: React.ReactNode }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}{count !== undefined && <span className="ml-2 text-lg font-normal text-slate-400">({count})</span>}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {filters && <div className="mb-4 flex flex-wrap items-center gap-2">{filters}</div>}
    </>
  );
}
