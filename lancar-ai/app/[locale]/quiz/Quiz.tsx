"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lightbulb, MessageCircle, RotateCcw } from "lucide-react";
import type { AppLocale } from "@/i18n/routing";
import { fill, type Dictionary } from "@/content";
import { isComplete, QUESTIONS, scoreQuiz, type QuizAnswers, type QuizResult } from "@/lib/quiz";
import { LeadForm } from "@/components/LeadForm";

type Props = {
  locale: AppLocale;
  labels: Dictionary["quiz"];
  formLabels: Dictionary["form"];
  tierNames: Dictionary["pricing"]["audit"]["tiers"];
  tierPrices: Record<string, string>;
  /** "https://wa.me/<number>?text=" or null while no WhatsApp number is configured. */
  whatsappBase: string | null;
};

type Answers = Partial<QuizAnswers>;

export function Quiz({ locale, labels, formLabels, tierNames, tierPrices, whatsappBase }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);

  // Move focus to the new question (or the result) so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (!started.current) return;
    headingRef.current?.focus();
  }, [step]);

  const go = (next: number) => {
    started.current = true;
    setStep(next);
  };

  const done = step >= QUESTIONS.length;
  if (done && isComplete(answers)) {
    return (
      <Result
        locale={locale}
        labels={labels}
        formLabels={formLabels}
        tierNames={tierNames}
        tierPrices={tierPrices}
        whatsappBase={whatsappBase}
        answers={answers}
        result={scoreQuiz(answers)}
        headingRef={headingRef}
        onRestart={() => {
          setAnswers({});
          go(0);
        }}
      />
    );
  }

  const question = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];
  const copy = labels.questions[question.id];
  const options = copy.options as Record<string, string>;
  const selectedTasks = answers.tasks ?? [];
  const isLast = step === QUESTIONS.length - 1;

  const choose = (option: string) => {
    setAnswers((current) => ({ ...current, [question.id]: option }));
    go(step + 1);
  };
  const toggleTask = (option: string) => {
    setAnswers((current) => {
      const tasks = current.tasks ?? [];
      const next = tasks.includes(option as never) ? tasks.filter((t) => t !== option) : [...tasks, option];
      return { ...current, tasks: next as QuizAnswers["tasks"] };
    });
  };

  return (
    <div className="card sm:p-9">
      <div className="flex items-center justify-between gap-4 text-sm font-semibold text-ink-600">
        <span>{fill(labels.progress, { n: step + 1, total: QUESTIONS.length })}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={QUESTIONS.length}
        aria-valuenow={step}
        aria-label={fill(labels.progress, { n: step + 1, total: QUESTIONS.length })}
        className="mt-3 h-2 overflow-hidden rounded-full bg-sea-100"
      >
        <div className="h-full rounded-full bg-sea-600 transition-[width] duration-300" style={{ width: `${(step / QUESTIONS.length) * 100}%` }} />
      </div>

      <h2 ref={headingRef} tabIndex={-1} className="mt-8 text-2xl font-extrabold tracking-tight text-ink-950 outline-none sm:text-3xl">
        {copy.q}
      </h2>
      {question.multi && <p className="mt-2 text-ink-600">{labels.multiHint}</p>}

      <div className="mt-6 grid gap-3">
        {question.options.map((option) => {
          const selected = question.multi ? selectedTasks.includes(option as never) : answers[question.id] === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => (question.multi ? toggleTask(option) : choose(option))}
              className={`flex min-h-14 items-center justify-between gap-4 rounded-2xl border-2 px-5 py-3.5 text-left text-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sea-500 focus-visible:ring-offset-2 ${
                selected ? "border-sea-600 bg-sea-50 text-ink-950" : "border-sand-200 bg-white text-ink-800 hover:border-sea-400"
              }`}
            >
              {options[option]}
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 ${question.multi ? "rounded-md" : "rounded-full"} ${
                  selected ? "border-sea-600 bg-sea-600 text-white" : "border-sand-300"
                }`}
              >
                {selected && <Check size={16} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => go(step - 1)} className="btn btn-outline">
            <ArrowLeft size={18} aria-hidden="true" />
            {labels.back}
          </button>
        ) : (
          <span />
        )}
        {(question.multi || answers[question.id] !== undefined) && (
          <button
            type="button"
            onClick={() => {
              if (question.multi && !answers.tasks) setAnswers((current) => ({ ...current, tasks: [] }));
              go(step + 1);
            }}
            className="btn btn-dark"
          >
            {isLast ? labels.seeResult : labels.next}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/** One score as a meter: name and explanation, a thin bar on a lighter track of the same hue, and the figure. */
function Meter({ name, hint, value }: { name: string; hint: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-lg font-bold text-ink-950">{name}</p>
        <p className="text-lg font-extrabold tabular-nums text-ink-950">
          {value}
          <span className="font-semibold text-ink-600">/100</span>
        </p>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={name}
        className="mt-2 h-2 overflow-hidden rounded-full bg-sea-100"
      >
        <div className="h-full rounded-full bg-sea-600" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 text-ink-600">{hint}</p>
    </div>
  );
}

function Result({
  locale,
  labels,
  formLabels,
  tierNames,
  tierPrices,
  whatsappBase,
  answers,
  result,
  headingRef,
  onRestart,
}: Props & { answers: QuizAnswers; result: QuizResult; headingRef: React.RefObject<HTMLHeadingElement | null>; onRestart: () => void }) {
  const r = labels.result;
  const profile = r.profiles[result.profile];
  const whatsappHref =
    whatsappBase &&
    whatsappBase + encodeURIComponent(fill(r.whatsappText, { opportunity: result.opportunity, readiness: result.readiness }));

  return (
    <div className="space-y-6">
      <div className="card sm:p-9">
        <p className="eyebrow">{r.title}</p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-3 text-3xl font-extrabold tracking-tight text-ink-950 outline-none sm:text-4xl">
          {profile.title}
        </h2>
        <p className="mt-3 text-lg leading-relaxed text-ink-600">{profile.body}</p>
        <div className="mt-8 grid gap-7 sm:grid-cols-2 sm:gap-10">
          <Meter name={r.opportunity} hint={r.opportunityHint} value={result.opportunity} />
          <Meter name={r.readiness} hint={r.readinessHint} value={result.readiness} />
        </div>
      </div>

      <div className="card sm:p-9">
        <h3 className="text-2xl font-extrabold tracking-tight text-ink-950">{r.recsTitle}</h3>
        <ol className="mt-6 space-y-5">
          {result.recommendations.map((rec) => (
            <li key={rec} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marigold-200 text-ink-950">
                <Lightbulb size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold text-ink-950">{r.recs[rec].title}</p>
                <p className="mt-1 leading-relaxed text-ink-600">{r.recs[rec].body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-2xl bg-sea-50 px-5 py-4">
          <p className="font-bold text-ink-950">{r.tierTitle}</p>
          <p className="mt-1 text-ink-700">
            {fill(r.tierBody, { name: tierNames[result.tier].name, price: tierPrices[result.tier] })}
          </p>
        </div>
      </div>

      <div className="card sm:p-9">
        <h3 className="text-2xl font-extrabold tracking-tight text-ink-950">{r.leadTitle}</h3>
        <p className="mt-2 mb-6 text-lg text-ink-600">{r.leadBody}</p>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn-primary mb-8">
            <MessageCircle size={18} aria-hidden="true" />
            {r.whatsappCta}
          </a>
        )}
        <LeadForm labels={formLabels} locale={locale} quiz={answers} />
      </div>

      <button type="button" onClick={onRestart} className="btn btn-outline">
        <RotateCcw size={18} aria-hidden="true" />
        {labels.restart}
      </button>
    </div>
  );
}
