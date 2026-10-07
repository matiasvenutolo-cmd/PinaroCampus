import { z } from "zod";

// Formato de un curso (docs/05-formato-de-cursos.md). Este schema es la fuente
// de verdad: lo usan el validador (`pnpm courses:validate`), el sync a la base
// y los tipos de las columnas jsonb de `courses`/`lessons`/`assessments`.

const kebabId = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "debe ser kebab-case (minúsculas, números y guiones)");

const lessonBase = {
  id: kebabId,
  title: z.string().min(1),
  durationMinutes: z.number().int().min(0),
  /** Por defecto: true en text/video/resource, false en quiz. */
  required: z.boolean().optional(),
};

const resourceSchema = z.object({
  title: z.string().min(1),
  file: z.string().min(1),
  description: z.string().optional(),
});
export type CourseResource = z.infer<typeof resourceSchema>;

const videoSchema = z.object({
  provider: z.enum(["youtube", "vimeo"]),
  url: z.string().url().nullable(),
});
export type LessonVideo = z.infer<typeof videoSchema>;

const lessonSchema = z.discriminatedUnion("type", [
  z.object({ ...lessonBase, type: z.literal("text"), file: z.string().min(1) }),
  z.object({
    ...lessonBase,
    type: z.literal("video"),
    file: z.string().min(1),
    video: videoSchema,
  }),
  z.object({
    ...lessonBase,
    type: z.literal("resource"),
    file: z.string().min(1),
    resources: z.array(resourceSchema).min(1),
  }),
  z.object({ ...lessonBase, type: z.literal("quiz"), assessment: kebabId }),
  z.object({ ...lessonBase, type: z.literal("exam"), assessment: kebabId }),
]);
export type CourseLessonDef = z.infer<typeof lessonSchema>;

const moduleSchema = z.object({
  id: kebabId,
  title: z.string().min(1),
  summary: z.string().default(""),
  lessons: z.array(lessonSchema).min(1),
});
export type CourseModuleDef = z.infer<typeof moduleSchema>;

const instructorSchema = z.object({
  name: z.string().min(1),
  bio: z.string().default(""),
  photo: z.string().nullable().default(null),
});

export const courseJsonSchema = z.object({
  schemaVersion: z.literal(1),
  slug: kebabId,
  status: z.enum(["draft", "coming_soon", "published"]),
  title: z.string().min(1),
  subtitle: z.string().default(""),
  description: z.string().default(""),
  level: z.enum(["inicial", "intermedio", "avanzado"]),
  language: z.string().default("es-AR"),
  durationMinutes: z.number().int().min(0),
  suggestedCategory: z.object({ slug: kebabId, name: z.string().min(1) }),
  tags: z.array(z.string()).default([]),
  cover: z.string().nullable().default(null),
  instructors: z.array(instructorSchema).default([]),
  outcomes: z.array(z.string()).default([]),
  audience: z.array(z.string()).default([]),
  prerequisites: z.array(z.string()).default([]),
  certificate: z
    .object({
      enabled: z.boolean(),
      hours: z.number().min(0),
      title: z.string().default("Certificado de aprobación"),
    })
    .default({ enabled: false, hours: 0, title: "Certificado de aprobación" }),
  completion: z
    .object({
      requireAllRequiredLessons: z.boolean().default(true),
      finalAssessment: kebabId.nullable().default(null),
    })
    .default({ requireAllRequiredLessons: true, finalAssessment: null }),
  modules: z.array(moduleSchema).min(1),
});
export type CourseJson = z.infer<typeof courseJsonSchema>;

/** Lo que se guarda en `courses.meta` (todo lo que no tiene columna propia). */
export interface CourseMeta {
  language: string;
  outcomes: string[];
  audience: string[];
  prerequisites: string[];
  tags: string[];
  instructors: { name: string; bio: string; photo: string | null }[];
  suggestedCategory: { slug: string; name: string };
  certificate: { enabled: boolean; title: string };
  completion: { requireAllRequiredLessons: boolean; finalAssessment: string | null };
}

/** Lo que se guarda en `lessons.meta`. */
export interface LessonMeta {
  video?: LessonVideo;
  resources?: CourseResource[];
}

// ---- Evaluaciones ----

const optionSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["single", "multiple", "true_false"]),
  prompt: z.string().min(1),
  options: z.array(optionSchema).optional(),
  correct: z.array(z.string()).min(1),
  explanation: z.string().optional(),
});
export type AssessmentQuestion = z.infer<typeof questionSchema>;

export const assessmentJsonSchema = z.object({
  id: kebabId,
  kind: z.enum(["quiz", "exam"]),
  title: z.string().min(1),
  description: z.string().default(""),
  passingScore: z.number().int().min(0).max(100).nullable(),
  maxAttempts: z.number().int().positive().nullable(),
  cooldownMinutes: z.number().int().min(0).default(0),
  timeLimitMinutes: z.number().int().positive().nullable(),
  drawCount: z.number().int().positive().nullable(),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showExplanations: z.enum(["after_submit", "after_pass", "never"]).default("after_submit"),
  questions: z.array(questionSchema).min(1),
});
export type AssessmentJson = z.infer<typeof assessmentJsonSchema>;

/** Calculadoras que existen (src/components/calculators). */
export const CALCULATOR_IDS = [
  "energy-cost",
  "vfd-savings",
  "air-leaks",
  "capacitor-sizing",
  "payback",
  "led-savings",
] as const;
export type CalculatorId = (typeof CALCULATOR_IDS)[number];

/** Lista cerrada de componentes permitidos en las lecciones MDX. */
export const ALLOWED_MDX_COMPONENTS = [
  "Callout",
  "KeyFigures",
  "KeyFigure",
  "Steps",
  "Step",
  "Accordion",
  "AccordionItem",
  "Checklist",
  "Calculator",
  "Figure",
  "Download",
  "Formula",
] as const;
