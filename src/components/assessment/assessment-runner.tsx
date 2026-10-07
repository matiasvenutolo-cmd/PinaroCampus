"use client";

import { ChevronLeft, ChevronRight, ClipboardCheck, Download, GraduationCap, Lock, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  saveAssessmentDraft,
  startAssessment,
  submitAssessment,
} from "@/lib/assessments/actions";
import type { AssessmentView, AttemptResult } from "@/lib/assessments/service";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CertificateNameForm } from "./certificate-name-form";
import { Confetti } from "./confetti";
import { ExamTimer } from "./exam-timer";
import { QuestionCard } from "./question-card";
import { ReviewList } from "./review-list";

type Answers = Record<string, string[]>;

const dateTime = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface Finished {
  result: AttemptResult;
  certificateCode: string | null;
  needsName: boolean;
  celebrate: boolean;
}

/**
 * Quiz de práctica y examen final. El servidor decide todo (sorteo, tiempo,
 * intentos, corrección); acá solo se muestran las preguntas SIN respuestas
 * correctas y se mandan las respuestas del alumno.
 */
export function AssessmentRunner({
  courseSlug,
  lessonKey,
  initialView,
  nextHref,
}: {
  courseSlug: string;
  lessonKey: string;
  initialView: AssessmentView;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [answers, setAnswers] = useState<Answers>(initialView.open?.answers ?? {});
  const [current, setCurrent] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  // Si el servidor refresca la página (router.refresh), se adopta su estado.
  const [seenView, setSeenView] = useState(initialView);
  if (initialView !== seenView) {
    setSeenView(initialView);
    setView(initialView);
    if (initialView.open) setAnswers(initialView.open.answers);
  }

  const open = view.open;
  const isExam = view.kind === "exam";
  const questions = open?.questions ?? [];
  const answeredCount = questions.filter((q) => (answers[q.id]?.length ?? 0) > 0).length;

  // Autoguardado del borrador (se pierde menos si se recarga o se corta la conexión).
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptId = open?.attemptId;
  const scheduleDraft = useCallback(
    (next: Answers) => {
      if (!attemptId) return;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        void saveAssessmentDraft({ courseSlug, lessonKey, attemptId, answers: next });
      }, 700);
    },
    [attemptId, courseSlug, lessonKey],
  );

  function setAnswer(questionId: string, value: string[]) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      scheduleDraft(next);
      return next;
    });
  }

  const submit = useCallback(() => {
    if (!attemptId || submitting.current) return;
    submitting.current = true;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    startTransition(async () => {
      const response = await submitAssessment({ courseSlug, lessonKey, attemptId, answers });
      submitting.current = false;
      if (!response.ok) {
        setError(response.error);
        setConfirming(false);
        return;
      }
      setError(null);
      setConfirming(false);
      setShowReview(false);
      setFinished({
        result: response.result,
        certificateCode: response.certificate?.code ?? null,
        needsName: response.needsName,
        celebrate: response.result.passed === true && isExam,
      });
      setView((prev) => ({ ...prev, open: undefined }));
      router.refresh();
    });
  }, [attemptId, answers, courseSlug, lessonKey, isExam, router]);

  function begin() {
    setError(null);
    startTransition(async () => {
      const response = await startAssessment({ courseSlug, lessonKey });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setFinished(null);
      setAnswers(response.view.open?.answers ?? {});
      setCurrent(0);
      setConfirming(false);
      setView(response.view);
    });
  }

  // ---- En curso ----
  if (open && !finished) {
    const question = questions[current];
    return (
      <section aria-label={view.title} className="flex flex-col gap-4">
        <div className="sticky top-12 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {answeredCount} de {questions.length} respondidas
          </p>
          {open.expiresAt ? <ExamTimer expiresAt={open.expiresAt} serverNow={view.now} onExpire={submit} /> : null}
        </div>

        {/* Desktop: todas en una columna. Mobile: una por pantalla. */}
        {questions.map((q, index) => (
          <QuestionCard
            key={q.id}
            index={index}
            total={questions.length}
            question={q}
            selected={answers[q.id] ?? []}
            onChange={(value) => setAnswer(q.id, value)}
            className={cn(index === current ? "block" : "hidden md:block")}
          />
        ))}

        <div className="flex items-center justify-between gap-2 md:hidden">
          <Button type="button" variant="outline" size="lg" className="h-9" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {current + 1} / {questions.length}
          </span>
          <Button type="button" variant="outline" size="lg" className="h-9" disabled={!question || current >= questions.length - 1} onClick={() => setCurrent((c) => c + 1)}>
            Siguiente <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

        {confirming ? (
          <div role="alertdialog" aria-label="Confirmar envío" className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium">
              {isExam ? "¿Enviar el examen?" : "¿Enviar tus respuestas?"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Respondiste {answeredCount} de {questions.length} preguntas.
              {answeredCount < questions.length ? " Las que dejaste sin responder cuentan como incorrectas." : ""}
              {isExam ? " Después de enviarlo no podés cambiar las respuestas." : ""}
            </p>
            <div className="mt-3 flex gap-2">
              <Button type="button" disabled={pending} onClick={submit}>
                {pending ? "Corrigiendo…" : "Sí, enviar"}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
                Seguir respondiendo
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="lg" className="h-10 self-start" onClick={() => setConfirming(true)}>
            {isExam ? "Enviar examen" : "Enviar respuestas"}
          </Button>
        )}
      </section>
    );
  }

  // ---- Resultado ----
  if (finished) {
    const { result } = finished;
    const passed = result.passed;
    const certificateCode = finished.certificateCode;
    return (
      <section aria-label="Resultado" className="relative flex flex-col gap-6">
        {finished.celebrate ? <Confetti /> : null}
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <span
            className={cn(
              "mx-auto flex size-12 items-center justify-center rounded-full",
              passed === false ? "bg-danger/10 text-danger" : "bg-success/15 text-success",
            )}
          >
            {passed === true && isExam ? <Trophy className="size-6" aria-hidden /> : <ClipboardCheck className="size-6" aria-hidden />}
          </span>
          <p className="mt-3 text-sm text-muted-foreground">
            {isExam ? `Intento ${result.attemptNumber}` : "Tu resultado"}
          </p>
          <p className="text-4xl font-semibold tabular-nums">{result.score}<span className="text-xl text-muted-foreground">/100</span></p>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.correctCount} de {result.total} correctas
          </p>
          {passed === true ? (
            <p className="mt-3 text-lg font-semibold text-success">¡Aprobaste{isExam ? " el examen" : ""}!</p>
          ) : passed === false ? (
            <p className="mt-3 text-lg font-semibold text-danger">
              No llegaste a la nota mínima ({view.passingScore}).
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Repasá las explicaciones y volvé a intentarlo cuando quieras.</p>
          )}
        </div>

        {isExam && passed ? (
          certificateCode ? (
            <CertificateCard code={certificateCode} />
          ) : finished.needsName ? (
            <CertificateNameForm
              courseSlug={courseSlug}
              lessonKey={lessonKey}
              onIssued={(code) => setFinished((prev) => (prev ? { ...prev, certificateCode: code, needsName: code === null } : prev))}
            />
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Estamos emitiendo tu certificado: aparece en Mis certificados en unos segundos.
            </p>
          )
        ) : null}

        {isExam && passed === false ? (
          <RetryInfo view={view} />
        ) : null}

        {result.review ? (
          <div>
            <Button type="button" variant="outline" onClick={() => setShowReview((v) => !v)}>
              {showReview ? "Ocultar la revisión" : "Ver la revisión de tus respuestas"}
            </Button>
            {showReview ? <div className="mt-4"><ReviewList items={result.review} /></div> : null}
          </div>
        ) : isExam ? (
          <p className="text-xs text-muted-foreground">
            {view.showExplanations === "never"
              ? "Este examen no muestra la revisión de las respuestas."
              : "Vas a poder ver la revisión de las respuestas cuando apruebes."}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!isExam ? (
            <Button type="button" variant="outline" disabled={pending} onClick={begin}>
              Repetir el repaso
            </Button>
          ) : null}
          {isExam && passed === false && view.status === "ready" ? (
            <Button type="button" disabled={pending} onClick={begin}>
              Volver a intentar
            </Button>
          ) : null}
          {nextHref && !isExam ? (
            <Link href={nextHref} className={cn(buttonVariants(), "h-9")}>
              Siguiente lección
            </Link>
          ) : null}
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </section>
    );
  }

  // ---- Antes de empezar ----
  return (
    <section aria-label={view.title} className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg text-primary" style={{ background: "var(--primary-soft)" }}>
            {isExam ? <GraduationCap className="size-5" aria-hidden /> : <ClipboardCheck className="size-5" aria-hidden />}
          </span>
          <p className="text-lg font-semibold">{isExam ? "Antes de empezar" : "Repasá lo que viste"}</p>
        </div>
        {view.description ? <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{view.description}</p> : null}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Preguntas" value={String(view.questionCount)} />
          {isExam ? <Stat label="Nota mínima" value={view.passingScore === null ? "—" : `${view.passingScore}/100`} /> : null}
          {isExam ? <Stat label="Tiempo" value={view.timeLimitMinutes ? formatDuration(view.timeLimitMinutes) : "Sin límite"} /> : null}
          {isExam ? (
            <Stat
              label="Intentos"
              value={view.maxAttempts === null ? "Ilimitados" : `${view.attemptsLeft} de ${view.maxAttempts} restantes`}
            />
          ) : null}
        </dl>

        {view.status === "locked" ? (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden /> {view.lockedReason}
          </p>
        ) : null}
        {view.status === "cooldown" && view.cooldownUntil ? (
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Podés volver a intentarlo el {dateTime.format(new Date(view.cooldownUntil))}.
          </p>
        ) : null}
        {view.status === "no_attempts" ? (
          <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            Usaste todos los intentos. Contactá a la cámara para que te habilite otro.
          </p>
        ) : null}
        {view.status === "passed" ? (
          <p className="mt-4 rounded-lg bg-success/15 px-3 py-2 text-sm font-medium text-success">
            Ya aprobaste este examen.
          </p>
        ) : null}

        {view.status === "ready" ? (
          <div className="mt-5">
            <Button type="button" size="lg" className="h-10" disabled={pending} onClick={begin}>
              {pending ? "Preparando…" : view.history.length > 0 ? (isExam ? "Empezar otro intento" : "Repetir el repaso") : isExam ? "Empezar el examen" : "Empezar el repaso"}
            </Button>
            {isExam && view.timeLimitMinutes ? (
              <p className="mt-2 text-xs text-muted-foreground">El tiempo empieza a correr apenas comenzás y no se pausa.</p>
            ) : null}
          </div>
        ) : null}
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      </div>

      {view.status === "passed" && view.certificate ? <CertificateCard code={view.certificate.code} /> : null}
      {view.status === "passed" && !view.certificate && view.needsName ? (
        <CertificateNameForm
          courseSlug={courseSlug}
          lessonKey={lessonKey}
          onIssued={() => router.refresh()}
        />
      ) : null}

      {view.history.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-medium">Tus intentos</p>
          <ul className="divide-y divide-border text-sm">
            {view.history.map((h) => (
              <li key={h.number} className="flex items-center justify-between py-2">
                <span>
                  Intento {h.number} · {dateTime.format(new Date(h.submittedAt))}
                </span>
                <span className={cn("font-medium tabular-nums", h.passed === false ? "text-danger" : h.passed ? "text-success" : "")}>
                  {h.score}/100{h.passed === true ? " · Aprobado" : h.passed === false ? " · Desaprobado" : ""}
                </span>
              </li>
            ))}
          </ul>
          {view.last?.review ? (
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowReview((v) => !v)}>
                {showReview ? "Ocultar la revisión del último intento" : "Ver la revisión del último intento"}
              </Button>
              {showReview ? <div className="mt-4"><ReviewList items={view.last.review} /></div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function CertificateCard({ code }: { code: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4" style={{ background: "var(--primary-soft)" }}>
      <GraduationCap className="size-6 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Tu certificado está listo</p>
        <p className="text-xs text-muted-foreground">Código {code}</p>
      </div>
      <a href={`/api/certificates/${code}/pdf`} className={cn(buttonVariants(), "h-9")}>
        <Download className="size-4" aria-hidden /> Descargar PDF
      </a>
      <Link href="/mi-campus/certificados" className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
        Mis certificados
      </Link>
    </div>
  );
}

function RetryInfo({ view }: { view: AssessmentView }) {
  const message = useMemo(() => {
    if (view.attemptsLeft === 0) return "Ya usaste todos los intentos. Contactá a la cámara para que te habilite otro.";
    const parts: string[] = [];
    if (view.attemptsLeft !== null) parts.push(`Te quedan ${view.attemptsLeft} ${view.attemptsLeft === 1 ? "intento" : "intentos"}.`);
    if (view.cooldownMinutes > 0) parts.push(`Tenés que esperar ${formatDuration(view.cooldownMinutes)} antes de volver a rendir.`);
    return parts.join(" ");
  }, [view]);
  if (!message) return null;
  return <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{message}</p>;
}
