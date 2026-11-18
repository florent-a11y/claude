/** Title block shared by the inner pages. */
export function PageHeader({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <header className="grain border-b border-sand-200 bg-sand-100/60">
      <div className="container-page py-14 sm:py-20">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="h-display mt-3 max-w-3xl text-5xl sm:text-6xl">{title}</h1>
        {intro && <p className="lead mt-5 max-w-2xl">{intro}</p>}
        {children}
      </div>
    </header>
  );
}
