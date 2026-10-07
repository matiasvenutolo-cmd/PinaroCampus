import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { AssessmentQuestion, CourseMeta, LessonMeta } from "@/lib/courses/schema";

import { assessmentKind, courseLevel, courseStatus, lessonType } from "./enums";
import { tenants } from "./tenants";

// Biblioteca global de cursos (docs/03-modelo-de-datos.md). La fuente de
// verdad del contenido son los archivos de content/courses/; esto es la
// estructura sincronizada por `pnpm courses:sync`.
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  ownerTenantId: uuid("owner_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  level: courseLevel("level").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  certificateHours: numeric("certificate_hours", { precision: 5, scale: 1 }).notNull().default("0"),
  coverUrl: text("cover_url"),
  status: courseStatus("status").notNull().default("draft"),
  contentHash: text("content_hash").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  meta: jsonb("meta").$type<CourseMeta>().notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courseModules = pgTable(
  "course_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.courseId, table.key)],
);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    kind: assessmentKind("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    passingScore: integer("passing_score"),
    maxAttempts: integer("max_attempts"),
    cooldownMinutes: integer("cooldown_minutes").notNull().default(0),
    timeLimitMinutes: integer("time_limit_minutes"),
    drawCount: integer("draw_count"),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    shuffleOptions: boolean("shuffle_options").notNull().default(false),
    showExplanations: text("show_explanations").notNull().default("after_submit"),
    // Banco completo CON respuestas: solo se lee en el servidor (CLAUDE.md regla 7).
    questions: jsonb("questions").$type<AssessmentQuestion[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.courseId, table.key)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => courseModules.id, { onDelete: "cascade" }),
    // `key` es estable para siempre: el progreso de los alumnos apunta a la lección.
    key: text("key").notNull(),
    title: text("title").notNull(),
    type: lessonType("type").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    contentRef: text("content_ref"),
    assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "set null" }),
    meta: jsonb("meta").$type<LessonMeta>().notNull().default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.courseId, table.key),
    index("lessons_module_id_idx").on(table.moduleId),
    index("lessons_assessment_id_idx").on(table.assessmentId),
  ],
);

export const coursesRelations = relations(courses, ({ many }) => ({
  modules: many(courseModules),
  lessons: many(lessons),
  assessments: many(assessments),
}));

export const courseModulesRelations = relations(courseModules, ({ one, many }) => ({
  course: one(courses, { fields: [courseModules.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  course: one(courses, { fields: [lessons.courseId], references: [courses.id] }),
  module: one(courseModules, { fields: [lessons.moduleId], references: [courseModules.id] }),
  assessment: one(assessments, { fields: [lessons.assessmentId], references: [assessments.id] }),
}));

export const assessmentsRelations = relations(assessments, ({ one }) => ({
  course: one(courses, { fields: [assessments.courseId], references: [courses.id] }),
}));
