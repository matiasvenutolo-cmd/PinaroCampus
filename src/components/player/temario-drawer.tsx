"use client";

import { ListTree } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Temario en un drawer para mobile; se cierra al elegir una lección. */
export function TemarioDrawer({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="md:hidden">
          <ListTree className="size-4" aria-hidden />
          Temario
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88%] max-w-sm overflow-y-auto p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Temario</SheetTitle>
          <SheetDescription className="line-clamp-2">{title}</SheetDescription>
        </SheetHeader>
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
