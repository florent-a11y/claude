import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Not found</h1>
      <p className="mt-1 text-sm text-slate-500">This page does not exist, or you do not have access to it.</p>
      <Link href="/" className="btn btn-primary mt-5">Back to home</Link>
    </div>
  );
}
