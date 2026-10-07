import { describe, expect, it } from "vitest";

import {
  canReview,
  drawAttempt,
  gradeAttempt,
  sanitizeAnswers,
  shuffle,
  toPublicQuestions,
  type Rng,
} from "@/lib/assessments/engine";
import type { AssessmentQuestion } from "@/lib/courses/schema";

const bank: AssessmentQuestion[] = [
  {
    id: "q1",
    type: "single",
    prompt: "Pregunta 1",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
    ],
    correct: ["b"],
    explanation: "SECRETO-EXPLICACION-1",
  },
  {
    id: "q2",
    type: "multiple",
    prompt: "Pregunta 2",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ],
    correct: ["a", "c"],
    explanation: "SECRETO-EXPLICACION-2",
  },
  { id: "q3", type: "true_false", prompt: "Pregunta 3", correct: ["false"], explanation: "SECRETO-EXPLICACION-3" },
  {
    id: "q4",
    type: "single",
    prompt: "Pregunta 4",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correct: ["a"],
  },
  {
    id: "q5",
    type: "single",
    prompt: "Pregunta 5",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correct: ["b"],
  },
];

/** RNG determinista: recorre una secuencia fija. */
const sequence = (values: number[]): Rng => {
  let i = 0;
  return (max) => values[i++ % values.length] % max;
};

describe("shuffle", () => {
  it("conserva los elementos y no muta el original", () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original, sequence([0, 1, 2, 3]));
    expect([...result].sort()).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("drawAttempt", () => {
  it("sortea drawCount preguntas distintas del banco", () => {
    const draw = drawAttempt(bank, { drawCount: 3, shuffleQuestions: false, shuffleOptions: false });
    expect(draw.questionIds).toHaveLength(3);
    expect(new Set(draw.questionIds).size).toBe(3);
    for (const id of draw.questionIds) expect(bank.map((q) => q.id)).toContain(id);
  });

  it("sin mezclar, respeta el orden del archivo", () => {
    const draw = drawAttempt(bank, { drawCount: 3, shuffleQuestions: false, shuffleOptions: false });
    const positions = draw.questionIds.map((id) => bank.findIndex((q) => q.id === id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("drawCount null o mayor al banco usa todas", () => {
    expect(drawAttempt(bank, { drawCount: null, shuffleQuestions: false, shuffleOptions: false }).questionIds).toHaveLength(5);
    expect(drawAttempt(bank, { drawCount: 99, shuffleQuestions: true, shuffleOptions: false }).questionIds).toHaveLength(5);
  });

  it("guarda el orden de las opciones (completo) y salta true_false", () => {
    const draw = drawAttempt(bank, { drawCount: null, shuffleQuestions: false, shuffleOptions: true });
    expect([...draw.optionOrders.q2].sort()).toEqual(["a", "b", "c", "d"]);
    expect(draw.optionOrders.q3).toBeUndefined();
  });
});

describe("toPublicQuestions: lo que viaja al navegador", () => {
  it("nunca incluye las respuestas correctas ni las explicaciones", () => {
    const draw = drawAttempt(bank, { drawCount: null, shuffleQuestions: true, shuffleOptions: true });
    const json = JSON.stringify(toPublicQuestions(bank, draw.questionIds, draw.optionOrders));
    expect(json).not.toContain("correct");
    expect(json).not.toContain("explanation");
    expect(json).not.toContain("SECRETO");
  });

  it("true_false muestra Verdadero y Falso con ids true/false", () => {
    const [q] = toPublicQuestions(bank, ["q3"], {});
    expect(q.options).toEqual([
      { id: "true", text: "Verdadero" },
      { id: "false", text: "Falso" },
    ]);
  });

  it("respeta el orden de opciones del intento", () => {
    const [q] = toPublicQuestions(bank, ["q1"], { q1: ["c", "a", "b"] });
    expect(q.options.map((o) => o.id)).toEqual(["c", "a", "b"]);
  });

  it("omite preguntas que ya no están en el banco", () => {
    expect(toPublicQuestions(bank, ["q1", "retirada"], {})).toHaveLength(1);
  });
});

describe("gradeAttempt", () => {
  const ids = ["q1", "q2", "q3", "q4", "q5"];

  it("acierta single, multiple (conjunto exacto) y true_false", () => {
    const { score, correctCount } = gradeAttempt(bank, ids, {
      q1: ["b"],
      q2: ["c", "a"],
      q3: ["false"],
      q4: ["a"],
      q5: ["b"],
    });
    expect(correctCount).toBe(5);
    expect(score).toBe(100);
  });

  it("multiple sin puntaje parcial: faltar una o sobrar una es incorrecto", () => {
    expect(gradeAttempt(bank, ["q2"], { q2: ["a"] }).score).toBe(0);
    expect(gradeAttempt(bank, ["q2"], { q2: ["a", "b", "c"] }).score).toBe(0);
    expect(gradeAttempt(bank, ["q2"], { q2: ["a", "c"] }).score).toBe(100);
  });

  it("sin responder cuenta como incorrecta", () => {
    expect(gradeAttempt(bank, ids, {}).score).toBe(0);
  });

  it("nota = round(100 × aciertos / preguntas)", () => {
    expect(gradeAttempt(bank, ids, { q1: ["b"] }).score).toBe(20);
    expect(gradeAttempt(bank, ids, { q1: ["b"], q3: ["false"], q4: ["a"] }).score).toBe(60);
    expect(gradeAttempt(bank, ["q1", "q4", "q5"], { q1: ["b"], q4: ["a"] }).score).toBe(67);
  });

  it("solo corrige las preguntas del intento", () => {
    const result = gradeAttempt(bank, ["q1", "q4"], { q1: ["b"], q4: ["a"], q5: ["b"] });
    expect(result.total).toBe(2);
    expect(result.score).toBe(100);
  });
});

describe("sanitizeAnswers", () => {
  it("descarta opciones inexistentes y preguntas ajenas al intento", () => {
    const clean = sanitizeAnswers(bank, ["q1", "q2"], {
      q1: ["zzz", "b"],
      q2: ["a", "a", "x"],
      q5: ["b"],
    });
    expect(clean).toEqual({ q1: ["b"], q2: ["a"] });
  });

  it("single y true_false aceptan una sola opción", () => {
    expect(sanitizeAnswers(bank, ["q1", "q3"], { q1: ["a", "b"], q3: ["true", "false"] })).toEqual({
      q1: ["a"],
      q3: ["true"],
    });
  });
});

describe("canReview (política de explicaciones)", () => {
  it("never no revisa nunca", () => {
    expect(canReview("never", true)).toBe(false);
  });
  it("after_pass solo si aprobó", () => {
    expect(canReview("after_pass", true)).toBe(true);
    expect(canReview("after_pass", false)).toBe(false);
    expect(canReview("after_pass", null)).toBe(false);
  });
  it("after_submit revisa siempre", () => {
    expect(canReview("after_submit", false)).toBe(true);
    expect(canReview("after_submit", null)).toBe(true);
  });
});
