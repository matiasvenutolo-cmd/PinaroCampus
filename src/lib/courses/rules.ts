import type { CourseLessonDef } from "./schema";

/**
 * ¿Cuenta esta lección en el `progress_pct`? (docs/05: por defecto true en
 * text/video/resource y false en quiz.) El examen final queda afuera a
 * propósito: se exige aparte (`completion.finalAssessment` aprobado, Fase 3),
 * así el avance de un alumno puede llegar a 100% antes de rendirlo.
 */
export function isLessonRequired(lesson: CourseLessonDef): boolean {
  if (lesson.type === "exam") return false;
  return lesson.required ?? lesson.type !== "quiz";
}
