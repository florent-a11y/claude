import Link from "next/link";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-slate-900">Not found</h1>
        <Link href="/" className="btn btn-primary mt-4">Go home</Link>
      </div>
    </div>
  );
}
