import type { PhotoKey } from "@/lib/photos";
import { Photo } from "./Photo";

/** Title block shared by the inner pages, with an optional photograph beside the text. */
export function PageHeader({ eyebrow, title, intro, photo, children }: { eyebrow?: string; title: string; intro?: string; photo?: PhotoKey; children?: React.ReactNode }) {
  return (
    <header className="border-b border-mist-200 bg-mist-50">
      <div className={`container-page grid items-center gap-10 py-12 sm:py-16 ${photo ? "lg:grid-cols-[1.1fr_0.9fr]" : ""}`}>
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="h-display mt-3 max-w-3xl text-4xl sm:text-5xl lg:text-6xl">{title}</h1>
          {intro && <p className="lead mt-5 max-w-2xl">{intro}</p>}
          {children}
        </div>
        {photo && <Photo name={photo} sizes="(min-width: 1024px) 560px, 100vw" className="aspect-[16/10] rounded-[2rem]" priority />}
      </div>
    </header>
  );
}
