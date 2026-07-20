import { metaCena, type CenaIconName } from './sceneTypes';

// Glifos emoji do design Workbench 1c (§ABA POS — itens de cena e timeline).
// O protótipo usa emoji colorido por tipo (🎥 🖥 🔍 👤 ▦ …) no lugar de
// ícones line-art; a chave continua sendo o `icon` de TIPOS_CENA.
const EMOJI: Record<CenaIconName, string> = {
  Film: '🎥',
  PanelBottom: '▦',
  FileText: '📋',
  Hash: '🔢',
  GitCompareArrows: '⚖',
  Sparkles: '✨',
  CircleHelp: '❓',
  Rocket: '🚀',
  AtSign: '👤',
  CalendarDays: '📅',
  BookOpen: '📖',
  List: '⏳',
  Brain: '🧠',
  Tag: '🏷',
  Check: '✅',
  Image: '🖼',
};

interface Props {
  tipo: string;
  size?: number;
  className?: string;
}

export function SceneTypeIcon({ tipo, size = 14, className }: Props) {
  const meta = metaCena(tipo);
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1 }} aria-hidden>
      {EMOJI[meta.icon] ?? '🎬'}
    </span>
  );
}

export function sceneTypeStyle(tipo: string) {
  const meta = metaCena(tipo);
  return {
    color: meta.color,
    soft: `color-mix(in oklch, ${meta.color} 16%, var(--wb-bg-card))`,
    border: `color-mix(in oklch, ${meta.color} 58%, var(--wb-border))`,
  };
}
