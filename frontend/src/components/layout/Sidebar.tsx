import { Link, useLocation, useMatch } from 'react-router-dom';
import {
  Check,
  FileText,
  Film,
  Folder,
  Home,
  Radio,
  Rocket,
  Scissors,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { ThemePicker } from './ThemePicker';

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  isActive?: (pathname: string) => boolean;
  disabled?: boolean;
  disabledReason?: string;
}

const globalItems: NavItem[] = [
  {
    to: '/projetos',
    label: 'Biblioteca',
    Icon: Home,
    isActive: (pathname) => pathname === '/' || pathname === '/projetos',
  },
  {
    to: '/ranking-lives',
    label: 'Ranking de lives',
    Icon: Trophy,
    isActive: (pathname) => pathname.startsWith('/ranking-lives'),
  },
  {
    to: '/buscar-lives',
    label: 'Buscar novas lives',
    Icon: Radio,
    isActive: (pathname) => pathname.startsWith('/buscar-lives'),
  },
  {
    to: '/padroes-thumbnail',
    label: 'Padrões de thumbnail',
    Icon: Sparkles,
    isActive: (pathname) => pathname.startsWith('/padroes-thumbnail'),
  },
  {
    to: '/canais',
    label: 'Configurações',
    Icon: SlidersHorizontal,
    isActive: (pathname) => pathname.startsWith('/canais'),
  },
];

function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  const { to, label, Icon, disabled, disabledReason } = item;
  const tooltipLabel = disabled ? `${label} - ${disabledReason}` : label;

  if (disabled) {
    return (
      <Tooltip label={tooltipLabel} side="right">
        <span
          aria-disabled="true"
          className="flex h-[38px] w-[38px] cursor-not-allowed items-center justify-center rounded-[var(--radius)] text-[var(--wb-text-dim)] opacity-45"
        >
          <Icon size={18} aria-hidden />
          <span className="sr-only">{label}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={tooltipLabel} side="right">
      <Link
        to={to}
        aria-label={label}
        className={cn(
          'relative flex h-[38px] w-[38px] items-center justify-center rounded-[var(--radius)] transition-colors',
          'text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
          active && 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]',
        )}
      >
        <Icon size={18} aria-hidden />
      </Link>
    </Tooltip>
  );
}

function SidebarDivider() {
  return <div className="my-2 h-px w-6 bg-[var(--wb-border)]" aria-hidden />;
}

interface SidebarProps {
  onOpenSettings: () => void;
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const { pathname } = useLocation();
  const matchProjetoDetalhe = useMatch('/projetos/:id');
  const matchProjetoFilho = useMatch('/projetos/:id/*');
  const projetoIdAtivo = matchProjetoFilho?.params.id ?? matchProjetoDetalhe?.params.id ?? null;

  const projectItems: NavItem[] = [
    {
      to: projetoIdAtivo ? `/projetos/${projetoIdAtivo}` : '#',
      label: 'Workspace do projeto',
      Icon: Folder,
      disabled: !projetoIdAtivo,
      disabledReason: 'selecione um projeto',
      isActive: (path) => path === `/projetos/${projetoIdAtivo}`,
    },
    {
      to: projetoIdAtivo ? `/projetos/${projetoIdAtivo}/cortes` : '#',
      label: 'Editor de cortes',
      Icon: Scissors,
      disabled: !projetoIdAtivo,
      disabledReason: 'selecione um projeto',
      isActive: (path) => path.startsWith(`/projetos/${projetoIdAtivo}/cortes`),
    },
    {
      to: projetoIdAtivo ? `/projetos/${projetoIdAtivo}/metadados` : '#',
      label: 'Metadados',
      Icon: FileText,
      disabled: !projetoIdAtivo,
      disabledReason: 'selecione um projeto',
      isActive: (path) => path.startsWith(`/projetos/${projetoIdAtivo}/metadados`),
    },
    {
      to: projetoIdAtivo ? `/projetos/${projetoIdAtivo}/post-production` : '#',
      label: 'Pós-produção',
      Icon: Rocket,
      disabled: !projetoIdAtivo,
      disabledReason: 'selecione um projeto',
      isActive: (path) =>
        path.startsWith(`/projetos/${projetoIdAtivo}/post-production`) ||
        path.startsWith(`/projetos/${projetoIdAtivo}/export`),
    },
    {
      to: projetoIdAtivo ? `/projetos/${projetoIdAtivo}/final-review` : '#',
      label: 'Revisão final',
      Icon: Check,
      disabled: !projetoIdAtivo,
      disabledReason: 'selecione um projeto',
      isActive: (path) => path.startsWith(`/projetos/${projetoIdAtivo}/final-review`),
    },
  ];

  return (
    <aside
      aria-label="Navegacao principal"
      className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col items-center justify-between border-r border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-[13px] py-5"
    >
      <div className="flex flex-col items-center gap-1">
        <div className="mb-2 flex h-[38px] w-[38px] items-center justify-center rounded-[var(--radius)] bg-[var(--wb-ink)] text-[var(--wb-ink-fg)]">
          <Film size={20} aria-hidden />
          <span className="sr-only">CortadorLive</span>
        </div>

        {globalItems.map((item) => (
          <SidebarItem key={item.to} item={item} active={item.isActive?.(pathname) ?? false} />
        ))}

        <SidebarDivider />

        {projectItems.map((item) => (
          <SidebarItem key={item.label} item={item} active={item.isActive?.(pathname) ?? false} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1">
        <ThemePicker />
        <Tooltip label="Ajustes" side="right">
          <IconButton aria-label="Ajustes" title="Ajustes" onClick={onOpenSettings}>
            <Settings aria-hidden />
          </IconButton>
        </Tooltip>
      </div>
    </aside>
  );
}
