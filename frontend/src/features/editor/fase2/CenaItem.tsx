import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Save,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import type { CenaRemotion } from '@/types/models';
import { salvarRetratoDeUrl } from '@/hooks/useEditor';
import { metaCena, TIPOS_CENA } from './sceneTypes';
import { SceneTypeIcon } from './SceneTypeIcon';

// ─────────────────────────────────────────────────────────────
// CenaItem — replica `design_reference/src/v3_pos.jsx > CenaListItem (709-867)`.
//
// Fechado: ícone do tipo (32x32) + nome + timecodes mono + chip tipo +
// chevron + alerta se ficha biografica sem retrato.
//
// Aberto: borda na cor do tipo + corpo com:
//   - Grid 4: Inicio / Fim / Tipo / Texto (campos editaveis com label mono)
//   - Grid 2: Subtexto / Contexto
//   - Comparativo: RotuloA / RotuloB
//   - Ficha: Nome curto
//   - Caption "Visual da cena (sobrescreve padrao do projeto)"
//   - Grid 3 ConfigSelect: Sombra / Layout / Modelo (todos com Auto)
//   - Se ficha_biografica: bloco retrato (avatar/status + Trocar/URL)
//   - Acoes: Ir (outline) · spacer · Remover (ghost) · Aplicar (accent) → fecha
// Mantem 100% da logica (onChange, onRemove, onSeek).
// ─────────────────────────────────────────────────────────────

type SombraOpt = NonNullable<CenaRemotion['sombra_nivel']>;
type LayoutOpt = NonNullable<CenaRemotion['layout_card']>;
type ModeloOpt = NonNullable<CenaRemotion['modelo_cena']>;

const SOMBRA_OPTS: SombraOpt[] = ['auto', 'nenhuma', 'leve', 'media', 'forte'];
const LAYOUT_OPTS: LayoutOpt[] = ['auto', 'horizontal', 'vertical'];
const MODELO_OPTS: ModeloOpt[] = ['auto', 'padrao', 'card'];

interface Props {
  cena: CenaRemotion;
  ativa: boolean;
  sobreposta: boolean;
  onChange: (next: CenaRemotion) => void;
  onRemove: () => void;
  onSeek: (seg: number) => void;
}

export function CenaItem({ cena, ativa, sobreposta, onChange, onRemove, onSeek }: Props) {
  const meta = metaCena(cena.tipo);
  const [aberto, setAberto] = useState(false);

  const set = (patch: Partial<CenaRemotion>) => onChange({ ...cena, ...patch });
  const isFicha = cena.tipo === 'ficha_biografica';
  const isComparativo =
    cena.tipo === 'comparativo_contraponto' || cena.tipo === 'comparativo_enfase';
  const semRetrato = isFicha && !cena.retrato_url;

  // Borda + fundo dependem de ativa/sobreposta. Conforme v3_pos.jsx:712-720:
  // ativa = bg color-mix(meta.color 10%) + border meta.color + sombra
  // inativa = bg --wb-bg-card-elev + border --wb-border-soft
  // sobreposta tem prioridade visual (warn outline) para chamar atencao.
  const containerStyle: React.CSSProperties = sobreposta
    ? {
        background: 'var(--wb-err-soft)',
        borderColor: 'var(--wb-err)',
      }
    : ativa
      ? {
          background: `color-mix(in oklch, ${meta.color} 10%, var(--wb-bg-card))`,
          borderColor: meta.color,
          boxShadow: 'var(--wb-shadow)',
        }
      : { background: 'var(--wb-bg-card-elev)', borderColor: 'var(--wb-border-soft)' };

  return (
    <div
      className="overflow-hidden rounded-[var(--radius-sm)] border transition-colors"
      style={containerStyle}
    >
      {/* Header — clique no card SEEKa pro inicio; chevron alterna expander.
          Trash ghost visivel mesmo no colapsado (decisao Paulo). */}
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <button
          type="button"
          onClick={() => onSeek(cena.inicio)}
          className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent text-left transition-opacity hover:opacity-90"
          title="Ir para essa cena"
        >
          <span
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-xs)] border"
            style={{
              background: `color-mix(in oklch, ${meta.color} 18%, var(--wb-bg-card))`,
              borderColor: `color-mix(in oklch, ${meta.color} 50%, var(--wb-border))`,
              color: meta.color,
            }}
            aria-hidden
          >
            <SceneTypeIcon tipo={cena.tipo} size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12.5px] font-semibold text-[var(--wb-text)]">
                {cena.texto || meta.label}
              </span>
              {semRetrato && (
                <Tooltip label="Ficha biografica sem retrato" side="top">
                  <AlertTriangle size={11} className="flex-shrink-0 text-[var(--wb-warn)]" />
                </Tooltip>
              )}
              {sobreposta && (
                <Tooltip label="Sobreposicao com outra cena" side="top">
                  <AlertTriangle size={11} className="flex-shrink-0 text-[var(--wb-err)]" />
                </Tooltip>
              )}
            </div>
            <div
              className="mt-0.5 font-code text-[10px] text-[var(--wb-text-dim)]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {cena.inicio.toFixed(1)}s → {cena.fim.toFixed(1)}s ·{' '}
              {(cena.fim - cena.inicio).toFixed(1)}s
            </div>
          </div>
          <span
            className="rounded-full px-2 py-0.5 font-code text-[9px] font-bold uppercase tracking-[0.06em]"
            style={{
              background: `color-mix(in oklch, ${meta.color} 14%, transparent)`,
              color: meta.color,
            }}
          >
            {meta.label}
          </span>
        </button>
        <Tooltip label="Remover cena" side="left">
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover cena"
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-err-soft)] hover:text-[var(--wb-err)]"
          >
            <Trash2 size={13} />
          </button>
        </Tooltip>
        <Tooltip label={aberto ? 'Recolher' : 'Editar cena'} side="left">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-label={aberto ? 'Recolher cena' : 'Editar cena'}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--wb-text-dim)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
          >
            {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </Tooltip>
      </div>

      {/* Body expandido — controles por-cena */}
      {aberto && (
        <div className="border-t border-dashed border-[var(--wb-border-soft)] px-3 pb-3 pt-2">
          {/* Grid 4: Inicio / Fim / Tipo / Texto */}
          <div className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-1.5">
            <FieldNum label="Inicio" value={cena.inicio} onChange={(v) => set({ inicio: v })} />
            <FieldNum label="Fim" value={cena.fim} onChange={(v) => set({ fim: v })} />
            <FieldSelect
              label="Tipo"
              value={cena.tipo}
              options={Object.entries(TIPOS_CENA).map(([key, m]) => ({
                value: key,
                label: m.label,
              }))}
              onChange={(v) => set({ tipo: v as CenaRemotion['tipo'] })}
            />
            <FieldText
              label="Texto"
              value={cena.texto ?? ''}
              onChange={(v) => set({ texto: v })}
              placeholder="Texto principal"
            />
          </div>

          {/* Grid 2: Subtexto / Contexto */}
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <FieldText
              label="Subtexto"
              value={cena.subtexto ?? ''}
              onChange={(v) => set({ subtexto: v })}
              placeholder="—"
            />
            <FieldText
              label="Contexto"
              value={cena.contexto ?? ''}
              onChange={(v) => set({ contexto: v })}
              placeholder="—"
            />
          </div>

          {/* Comparativo: RotuloA / RotuloB */}
          {isComparativo && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <FieldText
                label="Rotulo A"
                value={cena.rotuloA ?? ''}
                onChange={(v) => set({ rotuloA: v })}
                placeholder="TESE / ANTES"
              />
              <FieldText
                label="Rotulo B"
                value={cena.rotuloB ?? ''}
                onChange={(v) => set({ rotuloB: v })}
                placeholder="ANTITESE / DEPOIS"
              />
            </div>
          )}

          {/* Ficha: Nome curto */}
          {isFicha && (
            <div className="mt-1.5">
              <FieldText
                label="Nome curto"
                value={cena.nome_curto ?? ''}
                onChange={(v) => set({ nome_curto: v })}
                placeholder="Ex: Pat Kua"
              />
            </div>
          )}

          {/* Caption Visual */}
          <div className="mb-1 mt-3 font-code text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
            Visual da cena (sobrescreve padrao do projeto)
          </div>

          {/* Grid 3 ConfigSelect: Sombra / Layout / Modelo */}
          <div className="grid grid-cols-3 gap-1.5">
            <FieldSelect
              label="Sombra"
              value={cena.sombra_nivel ?? 'auto'}
              options={SOMBRA_OPTS.map((o) => ({ value: o, label: o }))}
              onChange={(v) => set({ sombra_nivel: v as SombraOpt })}
              title="Auto usa o padrao do projeto"
            />
            <FieldSelect
              label="Layout"
              value={cena.layout_card ?? 'auto'}
              options={LAYOUT_OPTS.map((o) => ({ value: o, label: o }))}
              onChange={(v) => set({ layout_card: v as LayoutOpt })}
              title="Auto usa o padrao do projeto"
            />
            <FieldSelect
              label="Modelo"
              value={cena.modelo_cena ?? 'auto'}
              options={MODELO_OPTS.map((o) => ({ value: o, label: o }))}
              onChange={(v) => set({ modelo_cena: v as ModeloOpt })}
              title="Auto usa o padrao do projeto"
            />
          </div>

          {/* Retrato — so para ficha biografica */}
          {isFicha && (
            <RetratoBlock cena={cena} onChange={(retratoUrl) => set({ retrato_url: retratoUrl })} />
          )}

          {/* Acoes — Remover saiu daqui (esta no header colapsado agora). */}
          <div className="mt-3 flex items-center gap-1.5">
            <Tooltip label="Ir para essa cena no player" side="top">
              <Button type="button" variant="outline" size="sm" onClick={() => onSeek(cena.inicio)}>
                <Target />
                Ir
              </Button>
            </Tooltip>
            <div className="flex-1" />
            <Tooltip label="Fechar editor" side="top">
              <Button type="button" variant="default" size="sm" onClick={() => setAberto(false)}>
                <Save />
                Aplicar
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FieldMini editavel · v3_pos.jsx:869-897 + edicao ─────────
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 font-code text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
      {children}
    </div>
  );
}

const fieldInputClass =
  'h-[26px] w-full rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-2 text-[11.5px] text-[var(--wb-text)] outline-none transition-colors focus:border-[var(--wb-accent)]';

function FieldText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={fieldInputClass}
      />
    </div>
  );
}

function FieldNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(fieldInputClass, 'font-code')}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
  title,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldInputClass, 'pr-1 font-code uppercase')}
        title={title}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Bloco de retrato (ficha biografica) · v3_pos.jsx:817-848 ──
function RetratoBlock({
  cena,
  onChange,
}: {
  cena: CenaRemotion;
  onChange: (retratoUrl: string | undefined) => void;
}) {
  const tem = Boolean(cena.retrato_url);
  const [persistindo, setPersistindo] = useState(false);
  const { notify } = useToast();
  const nome = (cena.texto ?? '').trim();

  // Quando o usuario cola uma URL externa, tentamos baixa-la para o banco
  // local de retratos usando o nome da pessoa (cena.texto) como chave. Assim
  // a proxima ficha biografica para a mesma pessoa ja acha no banco e nao
  // precisa colar a URL de novo. Se nao houver nome ou o download falhar,
  // ainda guardamos a URL crua para nao bloquear a edicao.
  const handleColarUrl = async () => {
    const next = window.prompt('URL do retrato', cena.retrato_url ?? '');
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      onChange(undefined);
      return;
    }

    const ehAbsoluta = /^https?:\/\//i.test(trimmed);
    if (!ehAbsoluta || !nome) {
      onChange(trimmed);
      return;
    }

    setPersistindo(true);
    try {
      const resultado = await salvarRetratoDeUrl(nome, trimmed);
      onChange(resultado.url);
      notify(`Retrato de "${resultado.nome}" salvo no banco.`, { tone: 'success' });
    } catch (error) {
      onChange(trimmed);
      notify(
        error instanceof Error
          ? `Nao deu pra salvar no banco (${error.message}). URL guardada so na cena.`
          : 'Nao deu pra salvar no banco. URL guardada so na cena.',
        { tone: 'warning' },
      );
    } finally {
      setPersistindo(false);
    }
  };

  return (
    <div className="mt-2.5 flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2.5">
      <div
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
        style={
          tem
            ? {
                background: 'linear-gradient(135deg, oklch(0.7 0.15 60), oklch(0.5 0.18 30))',
                color: '#fff',
              }
            : {
                background: 'var(--wb-bg-card)',
                border: '1.5px dashed var(--wb-border)',
                color: 'var(--wb-text-dim)',
              }
        }
        aria-hidden
      >
        {tem ? <Check size={18} strokeWidth={2.5} /> : <ImageIcon size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-semibold text-[var(--wb-text)]">
          {tem ? 'Retrato preenchido' : 'Sem retrato'}
        </div>
        <div
          className="mt-0.5 truncate font-code text-[10px] text-[var(--wb-text-mute)]"
          title={cena.retrato_url ?? undefined}
        >
          {cena.retrato_url ?? 'use Retratos (global) ou cole URL'}
        </div>
      </div>
      <Tooltip label={tem ? 'Trocar retrato' : 'Colar URL do retrato'} side="left">
        <Button
          type="button"
          variant={tem ? 'outline' : 'secondary'}
          size="sm"
          onClick={handleColarUrl}
          disabled={persistindo}
        >
          {persistindo ? <Loader2 className="animate-spin" /> : <Upload />}
          {tem ? 'Trocar' : 'URL'}
        </Button>
      </Tooltip>
    </div>
  );
}
