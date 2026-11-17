import { notFound } from "next/navigation";

/** Any unknown path under a language shows that language's 404 page (with header and footer). */
export default function CatchAll() {
  notFound();
}
