import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resolveCourseFile } from "@/lib/courses/files";
import { validateCourse } from "@/lib/courses/validate";

const SLUG = "eficiencia-energetica-pymes-industriales";
const SOURCE = path.join(process.cwd(), "content", "courses", SLUG);

let root: string;
const previous = process.env.COURSES_DIR;

function course(file: string) {
  return path.join(root, SLUG, file);
}
// Formas mínimas de lo que los tests tocan de course.json y de las evaluaciones.
interface CourseFile {
  slug: string;
  completion: { finalAssessment: string | null };
  modules: { lessons: { id: string; file?: string }[] }[];
}
interface Question {
  type: string;
  correct: string[];
  explanation?: string;
  options: { id: string }[];
}
interface AssessmentFile {
  drawCount: number;
  questions: Question[];
}

function editJson<T>(file: string, mutate: (json: T) => void) {
  const json = JSON.parse(readFileSync(course(file), "utf8")) as T;
  mutate(json);
  writeFileSync(course(file), JSON.stringify(json, null, 2));
}
function appendTo(file: string, text: string) {
  writeFileSync(course(file), readFileSync(course(file), "utf8") + text);
}
const errorsOf = async () => (await validateCourse(SLUG)).issues.filter((i) => i.level === "error");

// Cada test trabaja sobre una copia del curso demo en una carpeta temporal.
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "pc-courses-"));
  cpSync(SOURCE, path.join(root, SLUG), { recursive: true });
  process.env.COURSES_DIR = root;
});

afterAll(() => {
  if (previous === undefined) delete process.env.COURSES_DIR;
  else process.env.COURSES_DIR = previous;
});

describe("courses:validate", () => {
  it("el curso demo es válido, sin errores ni warnings", async () => {
    const result = await validateCourse(SLUG);
    expect(result.issues).toEqual([]);
    expect(result.course?.json.modules).toHaveLength(6);
    expect(result.course?.assessments).toHaveLength(6);
  });

  it("falla si se agrega un componente que no está en la lista (<Foo />)", async () => {
    appendTo("lessons/m1-l1-costo-de-produccion.mdx", "\n<Foo />\n");
    const errors = await errorsOf();
    expect(errors.some((e) => e.message.includes("<Foo>") && e.file.endsWith("m1-l1-costo-de-produccion.mdx"))).toBe(true);
    expect(errors.find((e) => e.message.includes("<Foo>"))?.line).toBeGreaterThan(1);
  });

  it("falla con import/export en el MDX", async () => {
    appendTo("lessons/m1-l1-costo-de-produccion.mdx", "\nimport Algo from './algo'\n");
    expect((await errorsOf()).some((e) => e.message.includes("import/export"))).toBe(true);
  });

  it("falla con expresiones sueltas {…} y con atributos que no son JSON", async () => {
    appendTo("lessons/m1-l1-costo-de-produccion.mdx", "\nHola {2 + 2}\n");
    appendTo("lessons/m1-l1-costo-de-produccion.mdx", '\n<Checklist id="x" items={[1 + 1]} />\n');
    const messages = (await errorsOf()).map((e) => e.message).join("\n");
    expect(messages).toContain("expresiones");
    expect(messages).toContain("literales JSON");
  });

  it("falla si se rompe una referencia a un archivo", async () => {
    editJson<CourseFile>("course.json", (j) => {
      j.modules[0].lessons[1].file = "lessons/no-existe.mdx";
    });
    expect((await errorsOf()).some((e) => e.message.includes("no-existe.mdx"))).toBe(true);
  });

  it("falla con un <Calculator id> desconocido, un <Download> inexistente y un <Figure> inexistente", async () => {
    appendTo(
      "lessons/m1-l1-costo-de-produccion.mdx",
      '\n<Calculator id="inventada" />\n<Download file="resources/fantasma.csv" label="x" />\n<Figure src="assets/fantasma.png" alt="x" />\n',
    );
    const messages = (await errorsOf()).map((e) => e.message).join("\n");
    expect(messages).toContain('id="inventada"');
    expect(messages).toContain("fantasma.csv");
    expect(messages).toContain("fantasma.png");
  });

  it("falla con ids de lección duplicados y con un slug distinto de la carpeta", async () => {
    editJson<CourseFile>("course.json", (j) => {
      j.slug = "otro-slug";
      j.modules[0].lessons[1].id = j.modules[0].lessons[0].id;
    });
    const messages = (await errorsOf()).map((e) => e.message).join("\n");
    expect(messages).toContain("distinto del nombre de la carpeta");
    expect(messages).toContain("id de lección duplicado");
  });

  it("falla si una respuesta correcta no está entre las opciones", async () => {
    editJson<AssessmentFile>("assessments/m1-quiz.json", (j) => {
      j.questions[0].correct = ["zzz"];
    });
    expect((await errorsOf()).some((e) => e.message.includes('correct "zzz"'))).toBe(true);
  });

  it("falla si 'single' tiene más de una correcta o 'multiple' tiene todas correctas", async () => {
    editJson<AssessmentFile>("assessments/m1-quiz.json", (j) => {
      const single = j.questions.find((q) => q.type === "single")!;
      single.correct = [single.options[0].id, single.options[1].id];
      const multiple = j.questions.find((q) => q.type === "multiple");
      if (multiple) multiple.correct = multiple.options.map((o) => o.id);
    });
    const messages = (await errorsOf()).map((e) => e.message).join("\n");
    expect(messages).toContain("exactamente una respuesta correcta");
  });

  it("falla si drawCount supera el banco de preguntas", async () => {
    editJson<AssessmentFile>("assessments/examen-final.json", (j) => {
      j.drawCount = 999;
    });
    expect((await errorsOf()).some((e) => e.message.includes("drawCount"))).toBe(true);
  });

  it("falla si finalAssessment no es de tipo exam", async () => {
    editJson<CourseFile>("course.json", (j) => {
      j.completion.finalAssessment = "m1-quiz";
    });
    expect((await errorsOf()).some((e) => e.message.includes("no es de tipo exam"))).toBe(true);
  });

  it("avisa (warning) si el banco es chico para el sorteo o falta una explicación", async () => {
    editJson<AssessmentFile>("assessments/examen-final.json", (j) => {
      j.questions = j.questions.slice(0, 16);
      delete j.questions[0].explanation;
    });
    const result = await validateCourse(SLUG);
    const warnings = result.issues.filter((i) => i.level === "warning").map((i) => i.message);
    expect(result.course).not.toBeNull();
    expect(warnings.some((w) => w.includes("1,5×"))).toBe(true);
    expect(warnings.some((w) => w.includes("sin explanation"))).toBe(true);
  });
});

describe("resolveCourseFile (archivos del curso)", () => {
  it("resuelve rutas normales dentro de la carpeta del curso", () => {
    expect(resolveCourseFile(SLUG, "lessons/m1-l1-costo-de-produccion.mdx")).toContain(`${SLUG}${path.sep}lessons`);
  });

  it.each(["../otro-curso/course.json", "../../package.json", "lessons/../../../.env.local", "/etc/passwd"])(
    "rechaza %s",
    (attempt) => {
      expect(() => resolveCourseFile(SLUG, attempt)).toThrow();
    },
  );

  it("rechaza slugs que intentan salirse", () => {
    expect(() => resolveCourseFile("../x", "course.json")).toThrow();
  });
});

describe("limpieza", () => {
  it("las carpetas temporales se pueden borrar", () => {
    expect(() => rmSync(root, { recursive: true, force: true })).not.toThrow();
  });
});
