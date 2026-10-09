import type { NextConfig } from "next";

// Las lecciones (MDX), los recursos y las imágenes de los cursos se leen del
// filesystem en runtime (content/courses/**). En Vercel hay que decirle a
// Next que esos archivos viajan con cada función que los usa.
const COURSE_CONTENT = ["./content/courses/**/*"];

// El PDF del certificado lee las fuentes (y las firmas de la demo) del filesystem.
const PDF_ASSETS = ["./src/lib/certificates/fonts/*", "./public/demo/*", "./public/brand/*"];

const nextConfig: NextConfig = {
  // La importación del padrón reenvía el CSV (hasta 1 MB) al confirmar.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },

  outputFileTracingIncludes: {
    "/[domain]/aprender/[slug]/[lessonKey]": COURSE_CONTENT,
    "/preview/[slug]/[lessonKey]": COURSE_CONTENT,
    // El `[...path]` de la ruta es una clase de caracteres para el glob: sin el comodín, en Vercel
    // la función de imágenes y descargas no recibía los archivos del curso (404 en producción).
    "/api/course-files/[slug]/[...path]": COURSE_CONTENT,
    "/api/course-files/**": COURSE_CONTENT,
    "/superadmin/cursos": COURSE_CONTENT,
    "/superadmin/cursos/[slug]": COURSE_CONTENT,
    "/api/certificates/[code]/pdf": PDF_ASSETS,
    "/[domain]/admin/certificados/configuracion/muestra": PDF_ASSETS,
  },
};

export default nextConfig;
