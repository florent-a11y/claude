/** Title block at the top of every inner page. */
export function PageHeader({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section className="border-b border-sand-200 bg-sand-100">
      <div className="container-page py-14 sm:py-20">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-ink-950 sm:text-5xl">{title}</h1>
        {intro && <p className="mt-5 max-w-2xl text-xl leading-relaxed text-ink-600">{intro}</p>}
        {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  );
}
