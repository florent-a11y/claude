import { APP_NAME, ORG_NAME } from "@/lib/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">{APP_NAME[0]}</span>
        <div>
          <div className="text-lg font-semibold text-slate-900">{APP_NAME}</div>
          <div className="text-xs text-slate-500">{ORG_NAME}</div>
        </div>
      </div>
      <div className="card w-full max-w-sm p-6">{children}</div>
    </div>
  );
}
