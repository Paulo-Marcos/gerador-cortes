import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { corteKey, cortesProjetoKey } from '@/hooks/useEditor';
import type { Corte } from '@/types/models';
import { hmsParaSeg, validarHms } from './timeUtils';

// F-056: criar corte manualmente a partir de [inicio_hms, fim_hms].
// Apos criar, dispara a analise de desvios (Gemini) para sugerir trechos a
// remover; a transcricao e re-sincronizada automaticamente pelo servico
// quando desvios sao importados. O corte e criado mesmo que a analise IA
// falhe.

interface Props {
  open: boolean;
  onClose: () => void;
  projetoId: string;
  onCreated?: (corte: Corte) => void;
}

type Fase = 'form' | 'criando' | 'analisando';

export function AdicionarCorteModal({ open, onClose, projetoId, onCreated }: Props) {
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
    notify(`Corte #${corteCriado.numero} criado. Buscando trechos a remover...`, {
      tone: 'success',
    });

    setFase('analisando');
    try {
      const comDesvios = await api.analisarDesviosIa(corteCriado.id);
      qc.setQueryData(corteKey(comDesvios.id), comDesvios);
      qc.invalidateQueries({ queryKey: cortesProjetoKey(projetoId) });
      onCreated?.(comDesvios);
    } catch (e) {
      notify(
        e instanceof Error
          ? `Corte criado. Falha na busca de trechos: ${e.message}`
          : 'Corte criado. Busca de trechos falhou; voce pode tentar de novo manualmente.',
        { tone: 'warning' },
      );
      onCreated?.(corteCriado);
    }

    onClose();
  }

  const labelAcao =
    fase === 'criando'
      ? 'Criando corte...'
      : fase === 'analisando'
        ? 'Buscando trechos a remover...'
        : 'Criar e buscar trechos';

  return (
    <Modal
      open={open}
      onClose={ocupado ? () => {} : onClose}
      title="Adicionar corte manualmente"
      description="Informe inicio e fim em HH:MM:SS. Apos criar, a IA vai sugerir trechos a remover."
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
            <input
              type="text"
              value={inicio}
              onChange={(event) => setInicio(event.target.value)}
              placeholder="00:00:00"
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-2.5 font-code text-sm text-text-100 outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
              disabled={ocupado}
              aria-invalid={!validarHms(inicio)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-300">
              Fim
            </span>
            <input
              type="text"
              value={fim}
              onChange={(event) => setFim(event.target.value)}
              placeholder="00:01:00"
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-2.5 font-code text-sm text-text-100 outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
              disabled={ocupado}
              aria-invalid={!validarHms(fim)}
            />
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
