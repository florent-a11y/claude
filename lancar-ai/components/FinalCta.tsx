import { Link } from "@/i18n/navigation";
import type { Dictionary } from "@/content";
import { Accent } from "./Accent";
import { Backdrop } from "./Backdrop";
import { BookCallButton } from "./Cta";
import { Reveal } from "./Reveal";

/** Closing call to action, shared by every page. */
export function FinalCta({ dict, title, body }: { dict: Dictionary; title?: string; body?: string }) {
  return (
    <section className="container-page pb-20 pt-4 sm:pb-28">
      <Reveal className="relative isolate overflow-hidden rounded-[2.5rem] border border-white/10 bg-night-900 px-6 py-16 text-center sm:px-12 sm:py-24">
        <Backdrop variant="cta" />
        <h2 className="mx-auto max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl sm:leading-[1.1]">
          <Accent text={title ?? dict.home.cta.title} />
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-mist-300">{body ?? dict.home.cta.body}</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <BookCallButton dict={dict} />
          <Link href="/quiz" className="btn btn-ghost-dark">
            {dict.home.hero.secondaryCta}
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
