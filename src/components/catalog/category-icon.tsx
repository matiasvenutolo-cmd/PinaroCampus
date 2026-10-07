import { Calculator, Cpu, GraduationCap, Globe, HardHat, Users, Zap, type LucideIcon } from "lucide-react";

// Los íconos de las categorías se guardan como nombre de lucide (docs/03).
const ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  "hard-hat": HardHat,
  users: Users,
  cpu: Cpu,
  globe: Globe,
  calculator: Calculator,
};

export function CategoryIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || GraduationCap;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
