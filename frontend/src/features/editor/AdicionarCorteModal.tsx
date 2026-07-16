import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock3, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { corteKey, cortesProjetoKey } from '@/hooks/useEditor';
import type { Corte } from '@/types/models';
import { hmsParaSeg, segParaHms, validarHms } from './timeUtils';

// F-056: criar corte manualmente a partir de [inicio_hms, fim_hms].
// D-382: nao dispara mais a busca automatica de trechos a remover via Gemini
// (o usuario nao usa mais essa etapa); quem quiser trechos sugeridos usa os
// fluxos manuais existentes (Gerar trechos / Analise IA) depois de criado.

interface Props {
  open: boolean;
  onClose: () => void;
  projetoId: string;
  onCreated?: (corte: Corte) => void;
  /** D-378: quando informado (aberto de dentro do Editor, com player ativo),
   *  mostra um botao "usar tempo atual" ao lado de inicio/fim. Ausente na
   *  tela do projeto (sem player) — os botoes ficam ocultos. */
  getCurrentTime?: () => number;
}

type Fase = 'form' | 'criando';

export function AdicionarCorteModal({
  open,
  onClose,
  projetoId,
  onCreated,
  getCurrentTime,
}: Props) {
  const qc = useQueryClient();
  const { notify } = useToast();

  const [inicio, setInicio] = useState('00:00:00');
  const [fim, setFim] = useState('00:00:00');
  const [titulo, setTitulo] = useState('');
  const [fase, setFase] = useState<Fase>('form');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInicio('00:00:00');
    setFim('00:00:00');
    setTitulo('');
    setFase('form');
    setErro(null);
  }, [open]);

  const ocupado = fase !== 'form';
  const podeSubmeter =
    validarHms(inicio) && validarHms(fim) && hmsParaSeg(fim) > hmsParaSeg(inicio);

  function usarTempoAtual(campo: 'inicio' | 'fim') {
    if (!getCurrentTime) return;
    const hms = segParaHms(getCurrentTime());
    if (campo === 'inicio') setInicio(hms);
    else setFim(hms);
  }

  async function submeter() {
    if (!podeSubmeter || ocupado) return;
    setErro(null);
    setFase('criando');

    let corteCriado: Corte;
    try {
      corteCriado = await api.criarCorteManual(projetoId, {
        inicio_hms: inicio,
        fim_hms: fim,
        titulo_proposto: titulo.trim() || null,
      });
    } catch (e) {
      setFase('form');
      setErro(e instanceof Error ? e.message : 'Falha ao criar corte.');
      return;
    }

    qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
    qc.setQueryData(corteKey(corteCriado.id), corteCriado);
    notify(`Corte #${corteCriado.numero} criado.`, { tone: 'success' });
    onCreated?.(corteCriado);
    onClose();
  }

  const labelAcao = fase === 'criando' ? 'Criando corte...' : 'Criar corte';

  return (
    <Modal
      open={open}
      onClose={ocupado ? () => {} : onClose}
      title="Adicionar corte manualmente"
      description="Informe inicio e fim em HH:MM:SS."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="button" onClick={submeter} disabled={!podeSubmeter || ocupado}>
            {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {labelAcao}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-300">
              Inicio
            </span>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={inicio}
                onChange={(event) => setInicio(event.target.value)}
                placeholder="00:00:00"
                className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-2.5 font-code text-sm text-text-100 outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
                disabled={ocupado}
                aria-invalid={!validarHms(inicio)}
              />
              {getCurrentTime && (
                <Tooltip label="Usar tempo atual do player" side="top">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => usarTempoAtual('inicio')}
                    disabled={ocupado}
                    aria-label="Usar tempo atual como inicio"
                  >
                    <Clock3 size={14} />
                  </Button>
                </Tooltip>
              )}
            </div>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-300">
              Fim
            </span>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={fim}
                onChange={(event) => setFim(event.target.value)}
                placeholder="00:01:00"
                className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-2.5 font-code text-sm text-text-100 outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
                disabled={ocupado}
                aria-invalid={!validarHms(fim)}
              />
              {getCurrentTime && (
                <Tooltip label="Usar tempo atual do player" side="top">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => usarTempoAtual('fim')}
                    disabled={ocupado}
                    aria-label="Usar tempo atual como fim"
                  >
                    <Clock3 size={14} />
                  </Button>
                </Tooltip>
              )}
            </div>
          </label>
        </div>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-300">
            Titulo (opcional)
          </span>
          <input
            type="text"
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            placeholder="Deixe vazio para usar 'Corte manual #N'"
            className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-2.5 text-sm text-text-100 outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
            disabled={ocupado}
            maxLength={500}
          />
        </label>

        {!podeSubmeter && validarHms(inicio) && validarHms(fim) && (
          <p className="text-xs text-error">O fim precisa ser maior que o inicio.</p>
        )}
        {(!validarHms(inicio) || !validarHms(fim)) && (
          <p className="text-xs text-text-400">
            Formato esperado: <span className="font-code">HH:MM:SS</span> (ex.{' '}
            <span className="font-code">01:23:45</span>).
          </p>
        )}
        {erro && <p className="text-xs text-error">{erro}</p>}
      </div>
    </Modal>
  );
}
