import { describe, expect, it } from "vitest";

import { isLessonRequired } from "@/lib/courses/rules";
import { pickContinueLesson } from "@/lib/courses/continue";
import type { StructureLesson } from "@/lib/courses/structure";
import { getVideoEmbedUrl } from "@/lib/courses/video";
import { signCoursePreviewToken, verifyCoursePreviewToken } from "@/lib/courses/preview-token";
import { getUnitPrice, resolveTier } from "@/lib/pricing";

const lesson = (key: string, isRequired = true): StructureLesson =>
  ({ id: `id-${key}`, key, isRequired }) as StructureLesson;

describe("pickContinueLesson", () => {
  const ordered = [lesson("a"), lesson("b"), lesson("quiz", false), lesson("c"), lesson("d")];

  it("sin avance arranca en la primera lección", () => {
    expect(pickContinueLesson(ordered, new Set(), null)?.key).toBe("a");
  });

  it("sigue en la lección donde quedó si todavía no la completó", () => {
    expect(pickContinueLesson(ordered, new Set(["id-a"]), "id-b")?.key).toBe("b");
  });

  it("después de completar, pasa a la siguiente obligatoria y se saltea los quizzes", () => {
    expect(pickContinueLesson(ordered, new Set(["id-a", "id-b"]), "id-b")?.key).toBe("c");
  });

  it("con todo completo se queda en la última vista", () => {
    const all = new Set(["id-a", "id-b", "id-c", "id-d"]);
    expect(pickContinueLesson(ordered, all, "id-d")?.key).toBe("d");
  });

  it("si la última vista es un quiz, sigue con la próxima obligatoria", () => {
    expect(pickContinueLesson(ordered, new Set(["id-a", "id-b"]), "id-quiz")?.key).toBe("c");
  });
});

describe("isLessonRequired", () => {
  it("text/video/resource sí, quiz no, el examen queda fuera del avance", () => {
    expect(isLessonRequired({ type: "text" } as never)).toBe(true);
    expect(isLessonRequired({ type: "quiz" } as never)).toBe(false);
    expect(isLessonRequired({ type: "exam" } as never)).toBe(false);
    expect(isLessonRequired({ type: "quiz", required: true } as never)).toBe(true);
  });
});

describe("getVideoEmbedUrl", () => {
  it("sin url no hay embed (se muestra el guion)", () => {
    expect(getVideoEmbedUrl({ provider: "youtube", url: null })).toBeNull();
  });

  it("YouTube siempre con youtube-nocookie.com", () => {
    expect(getVideoEmbedUrl({ provider: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(getVideoEmbedUrl({ provider: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("Vimeo", () => {
    expect(getVideoEmbedUrl({ provider: "vimeo", url: "https://vimeo.com/123456789" })).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("rechaza hosts que no son del proveedor", () => {
    expect(getVideoEmbedUrl({ provider: "youtube", url: "https://evil.example/watch?v=dQw4w9WgXcQ" })).toBeNull();
  });
});

describe("pricing (compra individual)", () => {
  it("solo un socio verificado de una empresa socia paga el precio socio", () => {
    expect(resolveTier({ memberStatus: "verified", companyIsMember: true })).toBe("member");
    expect(resolveTier({ memberStatus: "pending", companyIsMember: true })).toBe("non_member");
    expect(resolveTier({ memberStatus: "verified", companyIsMember: false })).toBe("non_member");
    expect(resolveTier(null)).toBe("non_member");
  });

  it("getUnitPrice elige según el tier", () => {
    const tc = { priceMemberCents: 4500000, priceNonMemberCents: 9000000 };
    expect(getUnitPrice(tc, "member")).toBe(4500000);
    expect(getUnitPrice(tc, "non_member")).toBe(9000000);
  });
});

describe("token de vista previa para docentes", () => {
  it("valida para su curso, no para otro, y rechaza manipulaciones", async () => {
    const token = await signCoursePreviewToken("curso-a");
    expect(await verifyCoursePreviewToken("curso-a", token)).toBe(true);
    expect(await verifyCoursePreviewToken("curso-b", token)).toBe(false);
    const [, signature] = token.split(".");
    expect(await verifyCoursePreviewToken("curso-a", `${Date.now() + 1e12}.${signature}`)).toBe(false);
    expect(await verifyCoursePreviewToken("curso-a", undefined)).toBe(false);
  });

  it("vencido no vale", async () => {
    const token = await signCoursePreviewToken("curso-a");
    const original = Date.now;
    Date.now = () => original() + 15 * 24 * 60 * 60 * 1000;
    try {
      expect(await verifyCoursePreviewToken("curso-a", token)).toBe(false);
    } finally {
      Date.now = original;
    }
  });
});
