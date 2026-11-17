import type { Dictionary } from "@/content";
import { FOUNDERS, initials } from "@/lib/team";
import { Accent } from "./Accent";
import { Reveal } from "./Reveal";

/** The three founders: monogram, name and role. Photos can replace the monograms once available. */
export function Founders({ dict }: { dict: Dictionary }) {
  const { founders } = dict;
  return (
    <section className="section">
      <div className="container-page">
        <Reveal>
          <h2 className="h2">
            <Accent text={founders.title} />
          </h2>
          <p className="lead">{founders.intro}</p>
        </Reveal>
        <ul className="mt-12 grid gap-5 sm:grid-cols-3">
          {FOUNDERS.map((person, index) => (
            <Reveal as="li" key={person.name} delay={index * 110} className="card glow-card flex flex-col items-center text-center sm:p-9">
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-gold-200 via-gold-400 to-azure-500 p-[2px]">
                <span className="flex h-full w-full items-center justify-center rounded-full bg-night-950 font-serif text-4xl italic text-white">
                  {initials(person.name)}
                </span>
              </span>
              <h3 className="mt-6 text-xl font-bold text-ink-900">{person.name}</h3>
              <p className="mt-1.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-gold-700">{founders.roles[person.role].short}</p>
              <p className="mt-1 text-ink-600">{founders.roles[person.role].full}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
