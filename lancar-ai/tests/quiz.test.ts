import assert from "node:assert/strict";
import { test } from "node:test";
import { isComplete, QUESTIONS, scoreQuiz, type QuizAnswers } from "../lib/quiz";

const quiet: QuizAnswers = {
  sector: "other",
  team: "micro",
  channel: "walkin",
  volume: "lt10",
  afterHours: "minutes",
  languages: "one",
  tasks: [],
  data: "paper",
  aiUse: "never",
  owner: "nobody",
};

const busy: QuizAnswers = {
  sector: "hospitality",
  team: "small",
  channel: "whatsapp",
  volume: "gt200",
  afterHours: "nextDay",
  languages: "many",
  tasks: ["faq", "booking", "invoices", "reports", "content"],
  data: "software",
  aiUse: "work",
  owner: "owner",
};

test("scores stay within 0 to 100 at both extremes", () => {
  assert.deepEqual([scoreQuiz(quiet).opportunity, scoreQuiz(quiet).readiness], [2, 10]);
  assert.deepEqual([scoreQuiz(busy).opportunity, scoreQuiz(busy).readiness], [100, 100]);
});

test("the four profiles follow the two scores", () => {
  assert.equal(scoreQuiz(busy).profile, "ready");
  assert.equal(scoreQuiz({ ...busy, data: "paper", aiUse: "never", owner: "nobody" }).profile, "foundations");
  assert.equal(scoreQuiz({ ...quiet, data: "software", aiUse: "work", owner: "owner" }).profile, "tune");
  assert.equal(scoreQuiz(quiet).profile, "start");
});

test("a business on paper is told to organise its information first", () => {
  const result = scoreQuiz({ ...busy, data: "paper" });
  assert.equal(result.recommendations[0], "digitize");
});

test("at most three recommendations, never repeated, never empty", () => {
  for (const answers of [quiet, busy, { ...quiet, aiUse: "work" as const, data: "sheets" as const }]) {
    const { recommendations } = scoreQuiz(answers);
    assert.ok(recommendations.length >= 1 && recommendations.length <= 3);
    assert.equal(new Set(recommendations).size, recommendations.length);
  }
});

test("a busy WhatsApp inbox suggests an assistant even when no task was ticked", () => {
  const result = scoreQuiz({ ...quiet, channel: "whatsapp", volume: "50to200", data: "sheets", aiUse: "work" });
  assert.ok(result.recommendations.includes("autoReply"));
});

test("many customer languages suggest multilingual replies", () => {
  assert.ok(scoreQuiz({ ...busy, tasks: ["faq"] }).recommendations.includes("multilingual"));
});

test("duplicate tasks are counted once", () => {
  const once = scoreQuiz({ ...quiet, tasks: ["faq"] }).opportunity;
  const twice = scoreQuiz({ ...quiet, tasks: ["faq", "faq"] }).opportunity;
  assert.equal(once, twice);
});

test("the suggested audit tier is the team size", () => {
  assert.equal(scoreQuiz({ ...busy, team: "medium" }).tier, "medium");
});

test("isComplete accepts full answers and rejects missing or unknown ones", () => {
  assert.equal(isComplete(busy), true);
  assert.equal(isComplete({ ...busy, tasks: [] }), true);
  const { owner: _owner, ...missing } = busy;
  assert.equal(isComplete(missing), false);
  assert.equal(isComplete({ ...busy, volume: "lots" as never }), false);
  assert.equal(isComplete({ ...busy, tasks: ["faq", "magic"] as never }), false);
});

test("there are ten questions", () => {
  assert.equal(QUESTIONS.length, 10);
});
