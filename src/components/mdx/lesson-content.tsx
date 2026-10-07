import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";

import { Calculator } from "@/components/calculators/calculator";
import type { CalculatorId } from "@/lib/courses/schema";

import { Accordion, AccordionItem } from "./accordion";
import { Callout } from "./callout";
import { Checklist } from "./checklist";
import { Formula } from "./formula";
import { KeyFigure, KeyFigures } from "./key-figures";
import { DownloadButton, LessonFigure, ScrollTable } from "./lesson-extras";
import { Step, Steps } from "./steps";

/**
 * Renderiza el MDX de una lección con la lista cerrada de componentes de
 * docs/05. `blockJS` va en false porque las listas (`items={[...]}`) son
 * expresiones; es seguro porque `courses:validate` (que corre en cada build,
 * vía courses:sync) solo deja pasar literales JSON en los atributos y rechaza
 * import/export y expresiones sueltas. `blockDangerousJS` sigue activo.
 */
export function LessonContent({
  source,
  courseSlug,
  lessonKey,
  checklists,
  readOnly,
  previewToken,
}: {
  source: string;
  courseSlug: string;
  lessonKey: string;
  checklists: Record<string, number[]>;
  readOnly: boolean;
  /** En la vista previa para docentes, los links a archivos llevan el token. */
  previewToken?: string;
}) {
  const fileUrl = (relativePath: string) =>
    `/api/course-files/${courseSlug}/${relativePath}${previewToken ? `?token=${encodeURIComponent(previewToken)}` : ""}`;

  const components = {
    Callout,
    KeyFigures,
    KeyFigure,
    Steps,
    Step,
    Accordion,
    AccordionItem,
    Formula,
    table: ScrollTable,
    Calculator: ({ id }: { id: CalculatorId }) => <Calculator id={id} />,
    Checklist: ({ id, items }: { id: string; items: string[] }) => (
      <Checklist
        id={id}
        items={items}
        courseSlug={courseSlug}
        lessonKey={lessonKey}
        initialChecked={checklists[id] ?? []}
        readOnly={readOnly}
      />
    ),
    Download: ({ file, label }: { file: string; label: string }) => (
      <DownloadButton href={fileUrl(file)} label={label} />
    ),
    Figure: ({ src, alt, caption }: { src: string; alt: string; caption?: string }) => (
      <LessonFigure src={fileUrl(src)} alt={alt} caption={caption} />
    ),
  };

  return (
    <div className="lesson-prose">
      <MDXRemote
        source={source}
        components={components}
        options={{ blockJS: false, mdxOptions: { remarkPlugins: [remarkGfm] } }}
      />
    </div>
  );
}
