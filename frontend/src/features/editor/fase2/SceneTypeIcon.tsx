import {
  AtSign,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CircleHelp,
  FileText,
  Film,
  GitCompareArrows,
  Hash,
  Image,
  List,
  PanelBottom,
  Rocket,
  Sparkles,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { metaCena, type CenaIconName } from './sceneTypes';

const ICONS: Record<CenaIconName, LucideIcon> = {
  Film,
  PanelBottom,
  FileText,
  Hash,
  GitCompareArrows,
  Sparkles,
  CircleHelp,
  Rocket,
  AtSign,
  CalendarDays,
  BookOpen,
  List,
  Brain,
  Tag,
  Check,
  Image,
};

interface Props {
  tipo: string;
  size?: number;
  className?: string;
}

export function SceneTypeIcon({ tipo, size = 14, className }: Props) {
  const meta = metaCena(tipo);
  const Icon = ICONS[meta.icon] ?? Film;
  return <Icon size={size} strokeWidth={1.85} className={className} aria-hidden />;
}

export function sceneTypeStyle(tipo: string) {
  const meta = metaCena(tipo);
  return {
    color: meta.color,
    soft: `color-mix(in oklch, ${meta.color} 16%, var(--wb-bg-card))`,
    border: `color-mix(in oklch, ${meta.color} 58%, var(--wb-border))`,
  };
}
