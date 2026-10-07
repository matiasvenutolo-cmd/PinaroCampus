import { randomInt } from "node:crypto";

import type { AssessmentQuestion } from "@/lib/courses/schema";

// Lógica pura de las evaluaciones (docs/05, "Evaluaciones"): sorteo, mezcla,
// corrección y lo que se le puede mostrar al cliente. Sin base de datos ni
// `server-only` para poder testearla directo.

export type Rng = (maxExclusive: number) => number;

/** Entero uniforme en [0, max) con la fuente criptográfica de Node. */
export const secureRng: Rng = (max) => randomInt(max);

/** Fisher-Yates; no muta el original. */
export function shuffle<T>(items: readonly T[], rng: Rng = secureRng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const TRUE_FALSE_OPTIONS = [
  { id: "true", text: "Verdadero" },
  { id: "false", text: "Falso" },
];

/** Opciones visibles de una pregunta (`true_false` no las trae en el JSON). */
export function optionsOf(question: AssessmentQuestion): { id: string; text: string }[] {
  return question.type === "true_false" ? TRUE_FALSE_OPTIONS : (question.options ?? []);
}

export interface AssessmentSettings {
  drawCount: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

export interface Draw {
  questionIds: string[];
  optionOrders: Record<string, string[]>;
}

/**
 * Sortea `drawCount` preguntas del banco (todas si es null), las mezcla si
 * corresponde y fija el orden de las opciones. Si no se mezcla, conserva el
 * orden del archivo. `true_false` siempre muestra "Verdadero" y después "Falso".
 */
export function drawAttempt(
  bank: readonly AssessmentQuestion[],
  settings: AssessmentSettings,
  rng: Rng = secureRng,
): Draw {
  const count = settings.drawCount === null ? bank.length : Math.min(settings.drawCount, bank.length);
  let picked: AssessmentQuestion[];
  if (count >= bank.length) {
    picked = [...bank];
  } else {
    // Se elige al azar qué preguntas entran, pero se respeta el orden del archivo
    // si no se pidió mezclarlas.
    const chosen = new Set(shuffle(bank.map((q) => q.id), rng).slice(0, count));
    picked = bank.filter((q) => chosen.has(q.id));
  }
  if (settings.shuffleQuestions) picked = shuffle(picked, rng);

  const optionOrders: Record<string, string[]> = {};
  for (const question of picked) {
    if (question.type === "true_false") continue;
    const ids = optionsOf(question).map((o) => o.id);
    optionOrders[question.id] = settings.shuffleOptions ? shuffle(ids, rng) : ids;
  }
  return { questionIds: picked.map((q) => q.id), optionOrders };
}

export interface PublicQuestion {
  id: string;
  type: AssessmentQuestion["type"];
  prompt: string;
  options: { id: string; text: string }[];
}

/**
 * La pregunta tal como viaja al navegador: sin `correct` ni `explanation`
 * (CLAUDE.md regla 7). Es el único camino por el que una pregunta llega al
 * cliente antes de enviar.
 */
export function toPublicQuestions(
  bank: readonly AssessmentQuestion[],
  questionIds: readonly string[],
  optionOrders: Record<string, string[]>,
): PublicQuestion[] {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const result: PublicQuestion[] = [];
  for (const id of questionIds) {
    const question = byId.get(id);
    if (!question) continue; // pregunta retirada del banco: no se muestra
    const all = optionsOf(question);
    const order = optionOrders[id];
    const options = order ? order.map((optId) => all.find((o) => o.id === optId)).filter((o) => o !== undefined) : all;
    result.push({ id: question.id, type: question.type, prompt: question.prompt, options });
  }
  return result;
}

/** Deja solo respuestas que existen entre las opciones de cada pregunta del intento. */
export function sanitizeAnswers(
  bank: readonly AssessmentQuestion[],
  questionIds: readonly string[],
  raw: Record<string, string[]>,
): Record<string, string[]> {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const clean: Record<string, string[]> = {};
  for (const id of questionIds) {
    const question = byId.get(id);
    const given = raw[id];
    if (!question || !Array.isArray(given)) continue;
    const valid = new Set(optionsOf(question).map((o) => o.id));
    let ids = [...new Set(given.filter((value) => valid.has(value)))];
    if (question.type !== "multiple") ids = ids.slice(0, 1);
    if (ids.length > 0) clean[id] = ids;
  }
  return clean;
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
}

/**
 * `single` y `true_false`: acierta si coincide con la correcta; `multiple`:
 * solo si el conjunto es exactamente igual (sin puntaje parcial).
 * Nota = round(100 × aciertos / preguntas).
 */
export function gradeAttempt(
  bank: readonly AssessmentQuestion[],
  questionIds: readonly string[],
  answers: Record<string, string[]>,
): { score: number; results: QuestionResult[]; correctCount: number; total: number } {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const results: QuestionResult[] = [];
  for (const id of questionIds) {
    const question = byId.get(id);
    if (!question) continue;
    const given = new Set(answers[id] ?? []);
    const expected = new Set(question.correct);
    const correct = given.size === expected.size && [...expected].every((value) => given.has(value));
    results.push({ questionId: id, correct });
  }
  const correctCount = results.filter((r) => r.correct).length;
  const total = results.length;
  return { score: total === 0 ? 0 : Math.round((100 * correctCount) / total), results, correctCount, total };
}

export type ExplanationPolicy = "after_submit" | "after_pass" | "never";

/** ¿Se puede mostrar la revisión (respuestas correctas y explicaciones) de este intento? */
export function canReview(policy: ExplanationPolicy, passed: boolean | null): boolean {
  if (policy === "never") return false;
  if (policy === "after_pass") return passed === true;
  return true;
}
