import type { ClaridadeDaCapa } from './api';
import { useClaridadeDaCapa } from './useEstiloDaCapa';
import { Icon } from '@/upgrade/Icon';

// D-909: a capa saiu mais escura que a meta do canal? Um aviso discreto embaixo
// dela, com o número — o operador decide se refaz. Capa dentro da meta não
// ganha nada: o silêncio é o "está bom".

/** O texto do aviso, ou null quando a capa está dentro da meta (ou sem medida). */
export function avisoDeClaridade(claridade?: ClaridadeDaCapa | null): string | null {
  if (!claridade?.abaixo_da_meta) return null;
  const partes: string[] = [];
  if (claridade.luminancia < claridade.luminancia_minima) {
    partes.push(`luz ${Math.round(claridade.luminancia)} (meta ≥ ${claridade.luminancia_minima})`);
  }
  if (claridade.escuros_pct > claridade.escuros_maximo) {
    partes.push(`${Math.round(claridade.escuros_pct)}% escuro (meta ≤ ${claridade.escuros_maximo}%)`);
  }
  return `Capa escura: ${partes.join(' · ')}`;
}

export function AvisoDeClaridade({ corteId, capaUrl }: { corteId: string; capaUrl?: string }) {
  const { data } = useClaridadeDaCapa(corteId, capaUrl);
  const aviso = avisoDeClaridade(data);
  if (!aviso) return null;
  return (
    <p
      className="-mt-1 flex items-center gap-1.5 text-[11px] leading-snug text-[var(--wb-warn-ink)]"
      title="Rosto em luz alta e frontal deixa a capa mais clara. A meta fica em Canais → Estilo das capas."
    >
      <Icon name="sun" size={14} />
      {aviso}
    </p>
  );
}
