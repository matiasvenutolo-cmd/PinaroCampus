import type { NextConfig } from "next";

// Las lecciones (MDX), los recursos y las imágenes de los cursos se leen del
// filesystem en runtime (content/courses/**). En Vercel hay que decirle a
// Next que esos archivos viajan con cada función que los usa.
const COURSE_CONTENT = ["./content/courses/**/*"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/[domain]/aprender/[slug]/[lessonKey]": COURSE_CONTENT,
    "/preview/[slug]/[lessonKey]": COURSE_CONTENT,
    "/api/course-files/[slug]/[...path]": COURSE_CONTENT,
    "/superadmin/cursos": COURSE_CONTENT,
    "/superadmin/cursos/[slug]": COURSE_CONTENT,
  },
};

export default nextConfig;
