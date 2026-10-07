"use client";

import { useEffect } from "react";

import { markLessonViewed } from "@/lib/courses/actions";

export function LessonViewTracker({ courseSlug, lessonKey }: { courseSlug: string; lessonKey: string }) {
  useEffect(() => {
    void markLessonViewed({ courseSlug, lessonKey });
  }, [courseSlug, lessonKey]);
  return null;
}
