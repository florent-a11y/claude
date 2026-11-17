import { Link } from "@/i18n/navigation";
import type { Dictionary } from "@/content";
import { BookCallButton } from "./Cta";

/** Closing call to action, shared by every page. */
export function FinalCta({ dict, title, body }: { dict: Dictionary; title?: string; body?: string }) {
  return (
    <section className="relative overflow-hidden bg-ink-950 text-white">
      <svg aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 w-full text-sea-500/25" viewBox="0 0 1200 96" preserveAspectRatio="none">
        <path d="M0 48c200-48 400-48 600 0s400 48 600 0v48H0z" fill="currentColor" />
      </svg>
      <div className="container-page relative py-20 text-center sm:py-24">
        <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">{title ?? dict.home.cta.title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-sand-100/80">{body ?? dict.home.cta.body}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <BookCallButton dict={dict} />
          <Link href="/quiz" className="btn btn-outline-light">
            {dict.home.hero.secondaryCta}
          </Link>
        </div>
      </div>
    </section>
  );
}
