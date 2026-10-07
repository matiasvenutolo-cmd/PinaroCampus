import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import { ALLOWED_MDX_COMPONENTS } from "./schema";

export interface MdxIssue {
  level: "error" | "warning";
  line?: number;
  message: string;
}

export interface MdxAnalysis {
  issues: MdxIssue[];
  calculatorIds: { id: string; line?: number }[];
  figureSources: { src: string; line?: number }[];
  downloadFiles: { file: string; line?: number }[];
  wordCount: number;
}

const ALLOWED = new Set<string>(ALLOWED_MDX_COMPONENTS);

interface JsxAttribute {
  type: string;
  name?: string;
  value?: string | { type: string; value: string } | null;
}

function stringAttribute(attributes: JsxAttribute[], name: string): string | undefined {
  const attribute = attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  return typeof attribute?.value === "string" ? attribute.value : undefined;
}

/**
 * Analiza el MDX de una lección con el parser real (remark-mdx) y aplica la
 * lista cerrada de la spec: solo componentes permitidos, sin import/export y
 * sin expresiones JS salvo literales JSON en atributos (`items={["a", "b"]}`).
 * Esa restricción es la que permite renderizar con seguridad más adelante.
 */
export function analyzeMdx(source: string): MdxAnalysis {
  const analysis: MdxAnalysis = {
    issues: [],
    calculatorIds: [],
    figureSources: [],
    downloadFiles: [],
    wordCount: 0,
  };

  let tree;
  try {
    tree = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).parse(source);
  } catch (error) {
    const err = error as { message?: string; line?: number };
    analysis.issues.push({
      level: "error",
      line: err.line ?? undefined,
      message: `MDX inválido: ${err.message ?? String(error)}`,
    });
    return analysis;
  }

  visit(tree, (node) => {
    const line = node.position?.start.line;
    const anyNode = node as unknown as {
      type: string;
      name?: string | null;
      value?: string;
      attributes?: JsxAttribute[];
    };

    if (anyNode.type === "text" && typeof anyNode.value === "string") {
      analysis.wordCount += anyNode.value.split(/\s+/).filter(Boolean).length;
      return;
    }

    if (anyNode.type === "mdxjsEsm") {
      analysis.issues.push({
        level: "error",
        line,
        message: "import/export no están permitidos en las lecciones MDX",
      });
      return;
    }

    if (anyNode.type === "mdxFlowExpression" || anyNode.type === "mdxTextExpression") {
      analysis.issues.push({
        level: "error",
        line,
        message: "Las expresiones {…} fuera de atributos no están permitidas",
      });
      return;
    }

    if (anyNode.type !== "mdxJsxFlowElement" && anyNode.type !== "mdxJsxTextElement") return;

    const name = anyNode.name;
    if (!name) {
      analysis.issues.push({ level: "error", line, message: "Los fragmentos <>…</> no están permitidos" });
      return;
    }
    if (!ALLOWED.has(name)) {
      analysis.issues.push({
        level: "error",
        line,
        message: `Componente <${name}> fuera de la lista permitida (${ALLOWED_MDX_COMPONENTS.join(", ")})`,
      });
      return;
    }

    const attributes = anyNode.attributes ?? [];
    for (const attribute of attributes) {
      if (attribute.type === "mdxJsxExpressionAttribute") {
        analysis.issues.push({ level: "error", line, message: `<${name}> usa {...spread}, no permitido` });
      } else if (attribute.value && typeof attribute.value === "object") {
        try {
          JSON.parse(attribute.value.value);
        } catch {
          analysis.issues.push({
            level: "error",
            line,
            message: `<${name} ${attribute.name}={…}> solo admite literales JSON (strings, números, arrays)`,
          });
        }
      }
    }

    if (name === "Calculator") {
      const id = stringAttribute(attributes, "id");
      if (id) analysis.calculatorIds.push({ id, line });
      else analysis.issues.push({ level: "error", line, message: '<Calculator> necesita id="…"' });
    }
    if (name === "Figure") {
      const src = stringAttribute(attributes, "src");
      if (src) analysis.figureSources.push({ src, line });
      else analysis.issues.push({ level: "error", line, message: '<Figure> necesita src="…"' });
    }
    if (name === "Download") {
      const file = stringAttribute(attributes, "file");
      if (file) analysis.downloadFiles.push({ file, line });
      else analysis.issues.push({ level: "error", line, message: '<Download> necesita file="…"' });
    }
  });

  return analysis;
}
