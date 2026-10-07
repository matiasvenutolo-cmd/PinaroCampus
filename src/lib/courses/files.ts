import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Carpeta con los cursos; `COURSES_DIR` permite apuntar a otra (tests). */
export function coursesDir(): string {
  return process.env.COURSES_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "courses");
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function courseDir(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Slug de curso inválido: ${slug}`);
  return path.join(coursesDir(), slug);
}

/**
 * Resuelve un archivo relativo dentro de la carpeta de un curso. Rechaza
 * cualquier ruta que se salga de esa carpeta (`..`, rutas absolutas): el `file`
 * viene de course.json y el segmento de la URL de los archivos descargables.
 */
export function resolveCourseFile(slug: string, relativePath: string): string {
  const base = courseDir(slug);
  if (path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new Error(`Ruta inválida: ${relativePath}`);
  }
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Ruta fuera de la carpeta del curso: ${relativePath}`);
  }
  return resolved;
}

export async function readCourseFile(slug: string, relativePath: string): Promise<string> {
  return readFile(/*turbopackIgnore: true*/ resolveCourseFile(slug, relativePath), "utf8");
}

export async function courseFileExists(slug: string, relativePath: string): Promise<boolean> {
  try {
    return (await stat(/*turbopackIgnore: true*/ resolveCourseFile(slug, relativePath))).isFile();
  } catch {
    return false;
  }
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name === ".DS_Store" ? [] : [full];
    }),
  );
  return files.flat();
}

/** sha256 de toda la carpeta del curso (rutas + contenido, en orden estable). */
export async function hashCourseDir(slug: string): Promise<string> {
  const base = courseDir(slug);
  const files = (await walk(base)).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(base, file));
    hash.update("\0");
    hash.update(await readFile(/*turbopackIgnore: true*/ file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function listCourseSlugs(): Promise<string[]> {
  const entries = await readdir(/*turbopackIgnore: true*/ coursesDir(), { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}
