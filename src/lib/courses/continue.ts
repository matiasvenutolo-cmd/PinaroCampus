import type { StructureLesson } from "./structure";

/**
 * A dónde lleva "Continuar": la lección donde quedó si todavía está pendiente;
 * si no, la primera obligatoria pendiente que sigue. Los quizzes y el examen no
 * cuentan como pendientes (no son obligatorios para el avance), así no frenan
 * el recorrido.
 */
export function pickContinueLesson(
  ordered: StructureLesson[],
  completedLessonIds: Set<string>,
  lastLessonId: string | null,
): StructureLesson | null {
  if (ordered.length === 0) return null;
  const isPending = (lesson: StructureLesson) => lesson.isRequired && !completedLessonIds.has(lesson.id);

  const last = lastLessonId ? ordered.find((l) => l.id === lastLessonId) : undefined;
  if (last && isPending(last)) return last;

  const startIndex = last ? ordered.indexOf(last) + 1 : 0;
  return ordered.slice(startIndex).find(isPending) ?? ordered.find(isPending) ?? last ?? ordered[0];
}
