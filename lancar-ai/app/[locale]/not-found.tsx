import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDictionary } from "@/content";

export default async function NotFound() {
  const { notFound } = getDictionary(await getLocale());
  return (
    <section className="container-page py-24 text-center sm:py-32">
      <p className="font-serif text-8xl italic leading-none"><span className="text-gold">404</span></p>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink-900">{notFound.title}</h1>
      <p className="mx-auto mt-3 max-w-md text-lg text-ink-600">{notFound.body}</p>
      <Link href="/" className="btn btn-primary mt-8">
        {notFound.cta}
      </Link>
    </section>
  );
}
