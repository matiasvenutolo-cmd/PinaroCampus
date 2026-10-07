import { readFile } from "node:fs/promises";

import { z } from "zod";

import { courseDir, courseFileExists, hashCourseDir, listCourseSlugs, readCourseFile } from "./files";
import { analyzeMdx } from "./mdx-check";
import {
  assessmentJsonSchema,
  CALCULATOR_IDS,
  courseJsonSchema,
  type AssessmentJson,
  type CourseJson,
} from "./schema";

export interface CourseIssue {
  level: "error" | "warning";
  /** Ruta relativa a la carpeta del curso. */
  file: string;
  line?: number;
  message: string;
}

export interface LoadedCourse {
  slug: string;
  json: CourseJson;
  assessments: AssessmentJson[];
  contentHash: string;
}

export interface CourseValidation {
  slug: string;
  issues: CourseIssue[];
  /** Presente solo si no hay errores (los warnings no bloquean). */
  course: LoadedCourse | null;
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`);
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const value of values) (seen.has(value) ? dup : seen).add(value);
  return [...dup];
}

/** Reglas de docs/05-formato-de-cursos.md, sección "Validador". */
export async function validateCourse(slug: string): Promise<CourseValidation> {
  const issues: CourseIssue[] = [];
  const error = (file: string, message: string, line?: number) =>
    issues.push({ level: "error", file, message, line });
  const warn = (file: string, message: string, line?: number) =>
    issues.push({ level: "warning", file, message, line });

  const fail = (): CourseValidation => ({ slug, issues, course: null });

  let rawCourse: unknown;
  try {
    rawCourse = JSON.parse(await readFile(/*turbopackIgnore: true*/ `${courseDir(slug)}/course.json`, "utf8"));
  } catch (e) {
    error("course.json", `No se pudo leer o parsear: ${(e as Error).message}`);
    return fail();
  }

  const parsed = courseJsonSchema.safeParse(rawCourse);
  if (!parsed.success) {
    for (const message of formatZodIssues(parsed.error)) error("course.json", message);
    return fail();
  }
  const json = parsed.data;

  if (json.slug !== slug) {
    error("course.json", `slug "${json.slug}" distinto del nombre de la carpeta "${slug}"`);
  }

  const lessons = json.modules.flatMap((m) => m.lessons);
  for (const id of duplicates(json.modules.map((m) => m.id))) {
    error("course.json", `id de módulo duplicado: ${id}`);
  }
  for (const id of duplicates(lessons.map((l) => l.id))) {
    error("course.json", `id de lección duplicado: ${id}`);
  }

  // Archivos referenciados
  for (const lesson of lessons) {
    if ("file" in lesson && !(await courseFileExists(slug, lesson.file))) {
      error("course.json", `Lección ${lesson.id}: no existe el archivo ${lesson.file}`);
    }
    if (lesson.type === "resource") {
      for (const resource of lesson.resources) {
        if (!(await courseFileExists(slug, resource.file))) {
          error("course.json", `Lección ${lesson.id}: no existe el recurso ${resource.file}`);
        }
      }
    }
  }
  if (json.cover && !(await courseFileExists(slug, json.cover))) {
    error("course.json", `No existe la portada ${json.cover}`);
  }

  // Evaluaciones
  const assessments: AssessmentJson[] = [];
  const assessmentRefs = lessons.flatMap((l) =>
    l.type === "quiz" || l.type === "exam" ? [{ lesson: l.id, id: l.assessment, type: l.type }] : [],
  );
  for (const id of duplicates(assessmentRefs.map((r) => r.id))) {
    error("course.json", `La evaluación ${id} está referenciada por más de una lección`);
  }

  for (const ref of assessmentRefs) {
    const file = `assessments/${ref.id}.json`;
    if (!(await courseFileExists(slug, file))) {
      error("course.json", `Lección ${ref.lesson}: no existe la evaluación ${file}`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await readCourseFile(slug, file));
    } catch (e) {
      error(file, `JSON inválido: ${(e as Error).message}`);
      continue;
    }
    const result = assessmentJsonSchema.safeParse(raw);
    if (!result.success) {
      for (const message of formatZodIssues(result.error)) error(file, message);
      continue;
    }
    const assessment = result.data;
    assessments.push(assessment);

    if (assessment.id !== ref.id) error(file, `id "${assessment.id}" distinto del nombre del archivo`);
    if (assessment.kind !== ref.type) {
      error(file, `kind "${assessment.kind}" no coincide con el tipo de lección "${ref.type}"`);
    }

    for (const id of duplicates(assessment.questions.map((q) => q.id))) {
      error(file, `id de pregunta duplicado: ${id}`);
    }
    for (const q of assessment.questions) {
      const where = `pregunta ${q.id}`;
      if (!q.explanation) warn(file, `${where}: sin explanation`);

      if (q.type === "true_false") {
        if (q.options) error(file, `${where}: true_false no lleva options`);
        if (q.correct.length !== 1 || !["true", "false"].includes(q.correct[0])) {
          error(file, `${where}: correct debe ser ["true"] o ["false"]`);
        }
        continue;
      }

      const optionIds = (q.options ?? []).map((o) => o.id);
      if (optionIds.length < 2) error(file, `${where}: necesita al menos 2 options`);
      for (const id of duplicates(optionIds)) error(file, `${where}: id de opción duplicado ${id}`);
      for (const c of q.correct) {
        if (!optionIds.includes(c)) error(file, `${where}: correct "${c}" no está entre las options`);
      }
      if (q.type === "single" && q.correct.length !== 1) {
        error(file, `${where}: single debe tener exactamente una respuesta correcta`);
      }
      if (q.type === "multiple") {
        if (q.correct.length < 2) error(file, `${where}: multiple necesita al menos 2 correctas`);
        if (q.correct.length >= optionIds.length) {
          error(file, `${where}: multiple necesita al menos una opción incorrecta`);
        }
      }
    }

    if (assessment.drawCount !== null && assessment.drawCount > assessment.questions.length) {
      error(file, `drawCount (${assessment.drawCount}) supera las preguntas del banco (${assessment.questions.length})`);
    }
    if (
      assessment.kind === "exam" &&
      assessment.drawCount !== null &&
      assessment.questions.length < assessment.drawCount * 1.5
    ) {
      warn(file, `El banco (${assessment.questions.length}) tiene menos de 1,5× drawCount (${assessment.drawCount}): poca variación entre intentos`);
    }
  }

  const finalKey = json.completion.finalAssessment;
  if (finalKey) {
    const final = assessments.find((a) => a.id === finalKey);
    const referenced = assessmentRefs.some((r) => r.id === finalKey);
    if (!referenced) error("course.json", `completion.finalAssessment "${finalKey}" no está referenciada por ninguna lección`);
    else if (final && final.kind !== "exam") {
      error("course.json", `completion.finalAssessment "${finalKey}" no es de tipo exam`);
    }
  }
  if (json.status === "published" && json.certificate.enabled && !finalKey) {
    warn("course.json", "El certificado está habilitado pero no hay completion.finalAssessment");
  }

  // MDX de cada lección
  for (const lesson of lessons) {
    if (!("file" in lesson) || !(await courseFileExists(slug, lesson.file))) continue;
    const analysis = analyzeMdx(await readCourseFile(slug, lesson.file));
    for (const issue of analysis.issues) {
      (issue.level === "error" ? error : warn)(lesson.file, issue.message, issue.line);
    }
    for (const calc of analysis.calculatorIds) {
      if (!(CALCULATOR_IDS as readonly string[]).includes(calc.id)) {
        error(lesson.file, `<Calculator id="${calc.id}"> desconocido (válidos: ${CALCULATOR_IDS.join(", ")})`, calc.line);
      }
    }
    for (const fig of analysis.figureSources) {
      if (!(await courseFileExists(slug, fig.src))) error(lesson.file, `<Figure src="${fig.src}"> no existe`, fig.line);
    }
    for (const dl of analysis.downloadFiles) {
      if (!(await courseFileExists(slug, dl.file))) error(lesson.file, `<Download file="${dl.file}"> no existe`, dl.line);
    }
    if (lesson.type === "text" && analysis.wordCount > 1500) {
      warn(lesson.file, `Lección de ${analysis.wordCount} palabras: considerá dividirla`);
    }
  }

  // Duración declarada vs. suma de lecciones
  const lessonsMinutes = lessons.reduce((sum, l) => sum + l.durationMinutes, 0);
  if (lessonsMinutes > 0 && Math.abs(json.durationMinutes - lessonsMinutes) / lessonsMinutes > 0.2) {
    warn("course.json", `durationMinutes (${json.durationMinutes}) difiere más de 20% de la suma de lecciones (${lessonsMinutes})`);
  }

  if (issues.some((i) => i.level === "error")) return fail();

  return {
    slug,
    issues,
    course: { slug, json, assessments, contentHash: await hashCourseDir(slug) },
  };
}

export async function validateAllCourses(): Promise<CourseValidation[]> {
  const slugs = await listCourseSlugs();
  return Promise.all(slugs.map(validateCourse));
}
