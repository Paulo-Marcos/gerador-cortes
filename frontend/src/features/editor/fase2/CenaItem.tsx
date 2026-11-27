import { useState, type CSSProperties, type ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import type { CenaRemotion } from '@/types/models';
import { salvarRetratoDeUrl } from '@/features/editor/useCenas';
import { FOCO } from '@/features/editor/salaDoEditor';
import { metaCena, TIPOS_CENA } from './sceneTypes';
import { SceneTypeIcon } from './SceneTypeIcon';
import { Icon } from '@/upgrade/Icon';

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
//   - Acoes: Ir (fantasma) · spacer · Aplicar (secundário) → fecha
// D-1070: o lixo virou Riscar (a cena fica no plano, fora do render) e o selo da
// origem vem de quem monta o plano (CenaComOrigem).
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
  onRiscar: () => void;
  onSeek: (seg: number) => void;
  /** D-1070: de onde a cena veio, ao lado do intervalo. */
  selo?: ReactNode;
}

export function CenaItem({ cena, ativa, sobreposta, onChange, onRiscar, onSeek, selo }: Props) {
  const meta = metaCena(cena.tipo);
  const [aberto, setAberto] = useState(false);

  const set = (patch: Partial<CenaRemotion>) => onChange({ ...cena, ...patch });
  const isFicha = cena.tipo === 'ficha_biografica';
  const isComparativo =
    cena.tipo === 'comparativo_contraponto' || cena.tipo === 'comparativo_enfase';
  const semRetrato = isFicha && !cena.retrato_url;

  // Borda + fundo dependem de ativa/sobreposta:
  // ativa = fundo e fio na cor do tipo (variável `--cor`, que vem do dado) + brilho do topo
  // inativa = vidro e fio de repouso
  // sobreposta tem prioridade visual (erro) para chamar atencao.
  const aparenciaDoCartao = sobreposta
    ? 'border-erro bg-erro/10'
    : ativa
      ? 'border-[color:var(--cor)] bg-[color-mix(in_srgb,var(--cor)_10%,transparent)] shadow-topo'
      : 'border-fio bg-vidro-2';

  return (
    <div
      className={cn('overflow-hidden rounded-campo border transition-colors motion-reduce:transition-none', aparenciaDoCartao)}
      style={{ '--cor': meta.color } as CSSProperties}
    >
      {/* Header — clique no card SEEKa pro inicio; chevron alterna expander.
          Riscar visivel mesmo no colapsado (decisao Paulo, D-1070). */}
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <button
          type="button"
          onClick={() => onSeek(cena.inicio)}
          data-sala=""
          className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-ladrilho border-0 bg-transparent text-left transition-opacity hover:opacity-90 motion-reduce:transition-none', FOCO)}
          title="Ir para essa cena"
        >
          <span
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-etiqueta border border-[color-mix(in_srgb,var(--cor)_50%,transparent)] bg-[color-mix(in_srgb,var(--cor)_18%,transparent)] text-[color:var(--cor)]"
            title={meta.label}
          >
            <SceneTypeIcon tipo={cena.tipo} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className="truncate text-corpo font-semibold text-fg"
                title={cena.texto || meta.label}
              >
                {cena.texto || meta.label}
              </span>
              {semRetrato && (
                <Tooltip label="Ficha biografica sem retrato" side="top">
                  <Icon name="triangle-alert" className="flex-shrink-0 text-aviso" />
                </Tooltip>
              )}
              {sobreposta && (
                <Tooltip label="Sobreposicao com outra cena" side="top">
                  <Icon name="triangle-alert" className="flex-shrink-0 text-erro" />
                </Tooltip>
              )}
            </div>
            {/* Intervalo numa única linha mono (DE-PARA-v2 §4). O chip de
                tipo saiu daqui — em ~124px disponíveis ele não convivia com
                o intervalo pros tipos de nome longo ("Card de informacao");
                o ícone à esquerda (cor + forma por tipo, tooltip com o nome)
                já é a identificação primária, sem duplicar em texto. */}
            <div className="num mt-0.5 flex min-w-0 text-micro text-fg-3">
              <span className="truncate">{cena.inicio.toFixed(1)}s → {cena.fim.toFixed(1)}s · {(cena.fim - cena.inicio).toFixed(1)}s</span>
              {selo}
            </div>
          </div>
        </button>
        <Tooltip label="Riscar: fica no plano, fora do render" side="left">
          <Button variant="fantasma" size="pq" soIcone onClick={onRiscar} aria-label="Riscar cena">
            <Icon name="eye-off" />
          </Button>
        </Tooltip>
        <Tooltip label={aberto ? 'Recolher' : 'Editar cena'} side="left">
          <Button
            type="button"
            variant="fantasma"
            size="pq" soIcone
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-label={aberto ? 'Recolher cena' : 'Editar cena'}
          >
            {aberto ? <Icon name="chevron-down" /> : <Icon name="chevron-right" />}
          </Button>
        </Tooltip>
      </div>

      {/* Body expandido — controles por-cena */}
      {aberto && (
        <div className="border-t border-dashed border-fio px-3 pb-3 pt-2">
          {/* Grid 4: Inicio / Fim / Tipo / Texto */}
          <div className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-1.5">
            <FieldNum campo="inicio" label="Início" value={cena.inicio} onChange={(v) => set({ inicio: v })} />
            <FieldNum campo="fim" label="Fim" value={cena.fim} onChange={(v) => set({ fim: v })} />
            <FieldSelect campo="tipo"
              label="Tipo"
              value={cena.tipo}
              options={Object.entries(TIPOS_CENA).map(([key, m]) => ({
                value: key,
                label: m.label,
              }))}
              onChange={(v) => set({ tipo: v as CenaRemotion['tipo'] })}
            />
            <FieldText campo="texto"
              label="Texto"
              value={cena.texto ?? ''}
              onChange={(v) => set({ texto: v })}
              placeholder="Texto principal"
            />
          </div>

          {/* Grid 2: Subtexto / Contexto */}
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <FieldText campo="subtexto"
              label="Subtexto"
              value={cena.subtexto ?? ''}
              onChange={(v) => set({ subtexto: v })}
              placeholder="—"
            />
            <FieldText campo="contexto"
              label="Contexto"
              value={cena.contexto ?? ''}
              onChange={(v) => set({ contexto: v })}
              placeholder="—"
            />
          </div>

          {/* Comparativo: RotuloA / RotuloB */}
          {isComparativo && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <FieldText campo="rotuloA"
                label="Rotulo A"
                value={cena.rotuloA ?? ''}
                onChange={(v) => set({ rotuloA: v })}
                placeholder="TESE / ANTES"
              />
              <FieldText campo="rotuloB"
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
              <FieldText campo="nome_curto"
                label="Nome curto"
                value={cena.nome_curto ?? ''}
                onChange={(v) => set({ nome_curto: v })}
                placeholder="Ex: Pat Kua"
              />
            </div>
          )}

          {/* Caption Visual */}
          <div className="mb-1 mt-3 text-micro text-fg-2">
            Visual da cena (sobrescreve padrao do projeto)
          </div>

          {/* Grid 3 ConfigSelect: Sombra / Layout / Modelo */}
          <div className="grid grid-cols-3 gap-1.5">
            <FieldSelect campo="sombra_nivel"
              label="Sombra"
              value={cena.sombra_nivel ?? 'auto'}
              options={SOMBRA_OPTS.map((o) => ({ value: o, label: o }))}
              onChange={(v) => set({ sombra_nivel: v as SombraOpt })}
              title="Auto usa o padrao do projeto"
            />
            <FieldSelect campo="layout_card"
              label="Layout"
              value={cena.layout_card ?? 'auto'}
              options={LAYOUT_OPTS.map((o) => ({ value: o, label: o }))}
              onChange={(v) => set({ layout_card: v as LayoutOpt })}
              title="Auto usa o padrao do projeto"
            />
            <FieldSelect campo="modelo_cena"
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

          {/* Acoes — Riscar mora no header colapsado. */}
          <div className="mt-3 flex items-center gap-1.5">
            <Tooltip label="Ir para essa cena no player" side="top">
              <Button type="button" variant="fantasma" size="pq" onClick={() => onSeek(cena.inicio)}>
                <Icon name="target" />
                Ir
              </Button>
            </Tooltip>
            <div className="flex-1" />
            <Tooltip label="Fechar editor" side="top">
              <Button type="button" variant="secundario" size="pq" onClick={() => setAberto(false)}>
                <Icon name="save" />
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
    <div className="mb-1 text-micro text-fg-3">{children}</div>
  );
}

const fieldInputClass = `h-7 w-full rounded-ladrilho border border-campo bg-poco px-2 text-pequeno text-fg transition-colors hover:border-fg/60 focus-visible:border-iris motion-reduce:transition-none ${FOCO}`;

function FieldText({
  campo,
  label,
  value,
  onChange,
  placeholder,
}: {
  campo: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <input name={campo}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-sala=""
        className={fieldInputClass}
      />
    </div>
  );
}

function FieldNum({
  campo,
  label,
  value,
  onChange,
}: {
  campo: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <input name={campo} inputMode="decimal"
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-sala=""
        className={cn(fieldInputClass, 'num')}
      />
    </div>
  );
}

function FieldSelect({
  campo,
  label,
  value,
  options,
  onChange,
  title,
}: {
  campo: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <select name={campo}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-sala=""
        className={cn(fieldInputClass, 'pr-1')}
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
    <div className="mt-2.5 flex items-center gap-2.5 rounded-campo border border-fio bg-poco p-2.5">
      <div
        className={cn(
          'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border',
          tem ? 'border-ok/40 bg-ok/10 text-ok' : 'border-dashed border-fio-2 bg-painel-solido text-fg-3',
        )}
        aria-hidden
      >
        {tem ? <Icon name="check" size={20} /> : <Icon name="image" size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-pequeno font-semibold text-fg">
          {tem ? 'Retrato preenchido' : 'Sem retrato'}
        </div>
        <div
          className="num mt-0.5 truncate text-micro text-fg-2"
          title={cena.retrato_url ?? undefined}
        >
          {cena.retrato_url ?? 'use Retratos (global) ou cole URL'}
        </div>
      </div>
      <Tooltip label={tem ? 'Trocar retrato' : 'Colar URL do retrato'} side="left">
        <Button
          type="button"
          variant={tem ? 'fantasma' : 'secundario'}
          size="pq"
          onClick={handleColarUrl}
          disabled={persistindo}
        >
          {persistindo ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="upload" />}
          {tem ? 'Trocar' : 'URL'}
        </Button>
      </Tooltip>
    </div>
  );
}
