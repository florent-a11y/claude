import { Accent } from "./Accent";
import { Backdrop } from "./Backdrop";
import { delay } from "./Reveal";

/** Title block at the top of every inner page. Words marked *like this* in the title are highlighted. */
export function PageHeader({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-cloud-200">
      <Backdrop />
      <div className="container-page py-14 sm:py-20">
        {eyebrow && <p className="eyebrow rise mb-4">{eyebrow}</p>}
        <h1 className="rise max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl" style={delay(70)}>
          <Accent text={title} />
        </h1>
        {intro && (
          <p className="rise mt-6 max-w-2xl text-xl leading-relaxed text-ink-600" style={delay(140)}>
            {intro}
          </p>
        )}
        {children && (
          <div className="rise mt-9 flex flex-wrap gap-3" style={delay(210)}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
