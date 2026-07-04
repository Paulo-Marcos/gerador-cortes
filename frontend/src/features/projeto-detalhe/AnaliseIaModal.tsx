import { useMemo, useState } from 'react';
import { AlertTriangle, Brain, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClaudeAiButton, ClaudeIcon } from '@/components/ui/claude-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { CLAUDE_BRAND } from '@/components/ui/claude-button';
import { parseManualJson } from '@/lib/manualPrompt';
import {
  PromptManualPanel,
  colarPartesCompleto,
  extrairPartesPrompt,
} from '@/components/PromptManualPanel';
import {
  useAnalisarViaClaude,
  useImportarAnalise,
  usePromptAnalise,
} from '@/hooks/useProjetoDetalhe';

interface Props {
  open: boolean;
  onClose: () => void;
  projetoId: string;
  duracaoSegundos: number;
  totalCortesExistentes: number;
}

type Modo = 'reanalisar' | 'intervalo';
type Origem = 'auto' | 'manual' | 'claude';

export function AnaliseIaModal({
  open,
  onClose,
  projetoId,
  duracaoSegundos,
  totalCortesExistentes,
}: Props) {
  const [modo, setModo] = useState<Modo>('reanalisar');
  const [origem, setOrigem] = useState<Origem>('claude');
  const [inicioHms, setInicioHms] = useState('00:00:00');
  const [fimHms, setFimHms] = useState('00:10:00');
  const [blocosPrompt, setBlocosPrompt] = useState(1);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [jsonPorParte, setJsonPorParte] = useState<Record<number, string>>({});
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const importarAnalise = useImportarAnalise(projetoId);
  const analisarClaude = useAnalisarViaClaude(projetoId);
  const intervaloPrompt =
    modo === 'intervalo'
      ? { inicio_hms: inicioHms.trim(), fim_hms: fimHms.trim(), blocos: blocosPrompt }
      : undefined;
  const prompt = usePromptAnalise(
    projetoId,
    open &&
      origem === 'manual' &&
      (!intervaloPrompt || Boolean(intervaloPrompt.inicio_hms && intervaloPrompt.fim_hms)),
    intervaloPrompt,
  );
  const partes = useMemo(() => extrairPartesPrompt(prompt.data), [prompt.data]);
  const totalPartes = partes.length;
  const partesColadas = useMemo(
    () => partes.filter((_, i) => Boolean(jsonPorParte[i]?.trim())).length,
    [partes, jsonPorParte],
  );
  const todasColadas = partesColadas === totalPartes;

  const precisaConfirmar =
    (modo === 'reanalisar' || origem === 'claude') && totalCortesExistentes > 0;
  const isPending = importarAnalise.isPending || analisarClaude.isPending;

  const reset = () => {
    setConfirmReplace(false);
    setJsonPorParte({});
    setJsonErr(null);
  };

  const fechar = () => {
    reset();
    onClose();
  };

  const onSelecionarManual = async () => {
    setOrigem('manual');
    if (!prompt.data) await prompt.refetch();
  };

  const usarFimDoVideo = () => {
    if (duracaoSegundos > 0) {
      setFimHms(segundosParaHms(duracaoSegundos));
    }
  };

  const onSubmitClaude = () => {
    if (precisaConfirmar && !confirmReplace) return;
    analisarClaude.mutate(undefined, { onSuccess: fechar });
  };

  const onSubmitManual = () => {
    setJsonErr(null);
    const validacao = colarPartesCompleto(jsonPorParte, totalPartes);
    if (!validacao.ok) {
      setJsonErr(validacao.erro);
      return;
    }
    const cortesTotais: unknown[] = [];
    for (let i = 0; i < validacao.textos.length; i++) {
      let parsed: unknown;
      try {
        parsed = parseManualJson(validacao.textos[i]);
      } catch (err) {
        setJsonErr(`Parte ${i + 1}: JSON inválido (${(err as Error).message}).`);
        return;
      }
      const cortes = extrairCortesImportados(parsed);
      if (!cortes || !Array.isArray(cortes)) {
        setJsonErr(`Parte ${i + 1}: JSON precisa ser array de cortes ou { cortes: [...] }.`);
        return;
      }
      cortesTotais.push(...cortes);
    }
    if (precisaConfirmar && !confirmReplace) return;
    importarAnalise.mutate({ cortes: cortesTotais }, { onSuccess: fechar });
  };

  return (
    <Modal
      open={open}
      onClose={fechar}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Brain size={18} className="text-accent-300" /> Análise IA
        </span>
      }
      description="Refazer a análise inteira ou gerar cortes em um intervalo específico."
    >
      <div className="flex flex-col gap-4">
        {/* Modo */}
        <div className="grid grid-cols-2 gap-2">
          <ModoButton
            active={modo === 'reanalisar'}
            onClick={() => {
              setModo('reanalisar');
              reset();
            }}
            emoji="🔄"
            title="Refazer toda a análise"
            hint="Remove cortes existentes e roda IA na transcrição completa."
          />
          <ModoButton
            active={modo === 'intervalo'}
            onClick={() => {
              setModo('intervalo');
              reset();
            }}
            emoji="🎯"
            title="Cortes em intervalo"
            hint="Gera cortes apenas dentro de uma faixa de tempo."
          />
        </div>

        {/* Inputs específicos do intervalo */}
        {modo === 'intervalo' && (
          <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900/40 p-3 sm:grid-cols-[1fr_1fr_120px]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inicio">
                <Clock size={12} className="mr-1 inline" /> Início (HH:MM:SS)
              </Label>
              <Input
                id="inicio"
                placeholder="00:00:00"
                value={inicioHms}
                onChange={(e) => setInicioHms(formatarMascaraHms(e.target.value))}
                className="font-mono"
                inputMode="numeric"
                maxLength={8}
                pattern="\d{2}:\d{2}:\d{2}"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fim">
                <Clock size={12} className="mr-1 inline" /> Fim (HH:MM:SS)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="fim"
                  placeholder="00:10:00"
                  value={fimHms}
                  onChange={(e) => setFimHms(formatarMascaraHms(e.target.value))}
                  className="font-mono"
                  inputMode="numeric"
                  maxLength={8}
                  pattern="\d{2}:\d{2}:\d{2}"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={usarFimDoVideo}
                  disabled={duracaoSegundos <= 0}
                  className="shrink-0"
                >
                  Usar fim
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="blocos">Blocos do prompt</Label>
              <Input
                id="blocos"
                type="number"
                min={1}
                max={20}
                value={blocosPrompt}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setBlocosPrompt(
                    Number.isFinite(value) ? Math.min(20, Math.max(1, Math.floor(value))) : 1,
                  );
                  setJsonPorParte({});
                }}
                className="font-mono"
              />
            </div>
          </div>
        )}

        {/* Aviso de substituição */}
        {precisaConfirmar && (
          <label className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 p-3 text-xs text-[#fbbf24]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1 text-text-200">
              Este projeto já tem <strong>{totalCortesExistentes} cortes</strong>. Refazer a análise
              irá <strong>removê-los</strong>. Confirme abaixo para prosseguir.
            </span>
            <input
              type="checkbox"
              checked={confirmReplace}
              onChange={(e) => setConfirmReplace(e.target.checked)}
              className="mt-0.5 h-4 w-4"
              aria-label="Confirmar substituição"
            />
          </label>
        )}

        {/* Origem (Claude em destaque + Manual ao lado em menor destaque) */}
        <div className="flex items-center gap-1 self-start rounded-full bg-bg-800 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setOrigem('claude')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors',
              origem !== 'claude' && 'text-text-300 hover:text-text-100',
            )}
            style={
              origem === 'claude' ? { backgroundColor: CLAUDE_BRAND, color: '#fff' } : undefined
            }
          >
            <ClaudeIcon size={13} />
            AI
          </button>
          <button
            type="button"
            onClick={() => {
              void onSelecionarManual();
            }}
            className={cn(
              'rounded-full px-3 py-1 transition-colors',
              origem === 'manual' ? 'bg-bg-700 text-text-100' : 'text-text-300 hover:text-text-100',
            )}
          >
            Manual
          </button>
        </div>

        {origem === 'claude' && (
          <div className="rounded-[var(--radius-sm)] border border-accent-500/40 bg-accent-500/10 p-3 text-xs text-text-200">
            <p className="flex items-center gap-1.5 font-semibold text-text-100">
              <ClaudeIcon size={14} className="text-accent-300" /> Analise completa por IA
            </p>
            <p className="mt-1 text-text-300">
              Usa a skill <code>cortador-expert</code> para gerar os cortes e os trechos a remover
              da <strong>live inteira</strong>, e em seguida emenda o{' '}
              <strong>refazer transcrição</strong> de cada corte. Pode levar{' '}
              <strong>1–3 minutos</strong> em lives longas — aguarde o spinner. Os cortes atuais só
              são substituídos quando a geração conclui.
            </p>
          </div>
        )}

        {origem === 'manual' && (
          <PromptManualPanel
            prompt={prompt}
            jsonPorParte={jsonPorParte}
            onChangeJsonPorParte={setJsonPorParte}
            jsonErro={jsonErr}
            onErrorChange={setJsonErr}
            jsonPlaceholder={'[\n  { "titulo_proposto": "...", "inicio_hms": "00:01:23", ... }\n]'}
            hint={
              modo === 'intervalo'
                ? `Para intervalo: trechos entre ${inicioHms} e ${fimHms}, em ${blocosPrompt} bloco(s).`
                : undefined
            }
          />
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={fechar} disabled={isPending}>
          Cancelar
        </Button>
        {origem === 'manual' && (
          <Button
            type="button"
            onClick={onSubmitManual}
            disabled={isPending || !todasColadas || (precisaConfirmar && !confirmReplace)}
          >
            {isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Importar análise{totalPartes > 1 ? ` (${partesColadas}/${totalPartes})` : ''}
          </Button>
        )}
        {origem === 'claude' && (
          <ClaudeAiButton
            size="md"
            pending={isPending}
            disabled={precisaConfirmar && !confirmReplace}
            onClick={onSubmitClaude}
            label="Gerar por IA"
            pendingLabel="Gerando..."
            title="Rodar analise completa via Claude"
          />
        )}
      </div>
    </Modal>
  );
}

function segundosParaHms(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(total % 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatarMascaraHms(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
}

function extrairCortesImportados(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) {
    const partes = parsed.filter(
      (item): item is { cortes: unknown[] } =>
        typeof item === 'object' &&
        item !== null &&
        'cortes' in item &&
        Array.isArray((item as { cortes?: unknown }).cortes),
    );

    if (partes.length === parsed.length && partes.length > 0) {
      return partes.flatMap((parte) => parte.cortes);
    }

    return parsed;
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'cortes' in parsed &&
    Array.isArray((parsed as { cortes?: unknown }).cortes)
  ) {
    return (parsed as { cortes: unknown[] }).cortes;
  }

  return null;
}

function ModoButton({
  active,
  onClick,
  emoji,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-[var(--radius)] border p-3 text-left transition-all',
        active
          ? 'border-accent-500/60 bg-accent-500/10'
          : 'border-[var(--border)] bg-bg-900/40 hover:border-[var(--border-hover)]',
      )}
    >
      <span className="text-lg" aria-hidden>
        {emoji}
      </span>
      <span className="text-sm font-semibold text-text-100">{title}</span>
      <span className="text-[11px] text-text-300">{hint}</span>
    </button>
  );
}
