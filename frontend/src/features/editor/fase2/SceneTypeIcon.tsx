import { Icon, type IconName } from '@/upgrade/Icon';
import { metaCena, type CenaIconName } from './sceneTypes';

// D-858: o tipo de cena era um emoji colorido (🎥 📋 🔢 …), herdado do
// protótipo Workbench 1c. Emoji fica fora da escala e do traço dos outros
// ícones — cada sistema desenha o seu. Agora é o ícone de traço do `icon` de
// TIPOS_CENA, na cor do tipo (o emoji trazia a cor no próprio desenho).
const ICONE_DO_TIPO: Record<CenaIconName, IconName> = {
  Film: 'film',
  PanelBottom: 'panel-bottom',
  FileText: 'file-text',
  Hash: 'hash',
  GitCompareArrows: 'git-compare-arrows',
  Sparkles: 'sparkles',
  CircleHelp: 'circle-help',
  Rocket: 'rocket',
  AtSign: 'at-sign',
  CalendarDays: 'calendar-days',
  BookOpen: 'book-open',
  List: 'list',
  Brain: 'brain',
  Tag: 'tag',
  Check: 'check',
  Image: 'image',
};

interface Props {
  tipo: string;
  className?: string;
}

export function SceneTypeIcon({ tipo, className }: Props) {
  const meta = metaCena(tipo);
  return <Icon name={ICONE_DO_TIPO[meta.icon]} className={className} style={{ color: meta.color }} />;
}

export function sceneTypeStyle(tipo: string) {
  const meta = metaCena(tipo);
  return {
    color: meta.color,
    soft: `color-mix(in oklch, ${meta.color} 16%, var(--wb-bg-card))`,
    border: `color-mix(in oklch, ${meta.color} 58%, var(--wb-border))`,
  };
}
