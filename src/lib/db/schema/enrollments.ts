import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { categories } from "./categories";
import { orders, seatCodes } from "./commerce";
import { courses, lessons } from "./courses";
import {
  courseVisibility,
  enrollmentSource,
  enrollmentStatus,
  lessonProgressStatus,
} from "./enums";
import { tenants } from "./tenants";

// Qué cursos ofrece cada cámara y a qué precio (🔒 tenant_id).
export const tenantCourses = pgTable(
  "tenant_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    visibility: courseVisibility("visibility").notNull().default("public"),
    priceMemberCents: bigint("price_member_cents", { mode: "number" }).notNull().default(0),
    priceNonMemberCents: bigint("price_non_member_cents", { mode: "number" }).notNull().default(0),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    enrollmentOpen: boolean("enrollment_open").notNull().default(true),
    accessDays: integer("access_days"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.tenantId, table.courseId),
    index("tenant_courses_category_id_idx").on(table.categoryId),
    index("tenant_courses_course_id_idx").on(table.courseId),
  ],
);

// 🔒 tenant_id.
export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    tenantCourseId: uuid("tenant_course_id")
      .notNull()
      .references(() => tenantCourses.id, { onDelete: "cascade" }),
    source: enrollmentSource("source").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    seatCodeId: uuid("seat_code_id").references(() => seatCodes.id, { onDelete: "set null" }),
    status: enrollmentStatus("status").notNull().default("active"),
    progressPct: integer("progress_pct").notNull().default(0),
    lastLessonId: uuid("last_lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.tenantId, table.userId, table.courseId),
    index("enrollments_tenant_course_status_idx").on(table.tenantId, table.courseId, table.status),
    index("enrollments_user_id_idx").on(table.userId),
    index("enrollments_tenant_course_id_idx").on(table.tenantCourseId),
  ],
);

export interface LessonProgressMeta {
  /** id del `<Checklist>` → índices tildados. */
  checklists?: Record<string, number[]>;
}

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    status: lessonProgressStatus("status").notNull().default("started"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb("meta").$type<LessonProgressMeta>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.enrollmentId, table.lessonId),
    index("lesson_progress_lesson_id_idx").on(table.lessonId),
  ],
);

// 🔒 tenant_id. Lista de espera de cursos "Próximamente".
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    companyName: text("company_name"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.tenantId, table.courseId, table.email),
    index("waitlist_entries_course_id_idx").on(table.courseId),
  ],
);

export const tenantCoursesRelations = relations(tenantCourses, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantCourses.tenantId], references: [tenants.id] }),
  course: one(courses, { fields: [tenantCourses.courseId], references: [courses.id] }),
  category: one(categories, { fields: [tenantCourses.categoryId], references: [categories.id] }),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, { fields: [enrollments.userId], references: [users.id] }),
  course: one(courses, { fields: [enrollments.courseId], references: [courses.id] }),
  tenantCourse: one(tenantCourses, {
    fields: [enrollments.tenantCourseId],
    references: [tenantCourses.id],
  }),
}));

export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  enrollment: one(enrollments, {
    fields: [lessonProgress.enrollmentId],
    references: [enrollments.id],
  }),
  lesson: one(lessons, { fields: [lessonProgress.lessonId], references: [lessons.id] }),
}));
