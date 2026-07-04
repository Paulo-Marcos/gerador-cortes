// D-066: avaliação do par prompt+imagem de thumbnail, ao lado da capa.
// Caminho rápido: um clique no veredito ("Ótimo/Bom/Regular/Ruim") registra na
// hora. Caminho detalhado: critérios (1-5) + comentário. O histórico acumulado
// alimenta, mais adiante, um agente que procura o que os melhores têm em comum.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CRITERIOS,
  VEREDITOS,
  montarPayloadAvaliacao,
  rotuloVeredito,
  type NotasState,
} from './thumbnailAvaliacao';
import type { VeredictoThumbnail } from '@/types/models';

const avaliacoesKey = (corteId: string) => ['avaliacoes-thumbnail', corteId] as const;

function formatarData(iso: string | null): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function ThumbnailAvaliacaoPanel({ corteId }: { corteId: string }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [detalhar, setDetalhar] = useState(false);
  const [veredito, setVeredito] = useState<VeredictoThumbnail>('bom');
  const [notas, setNotas] = useState<NotasState>({});
  const [comentario, setComentario] = useState('');

  const historicoQuery = useQuery({
    queryKey: avaliacoesKey(corteId),
    queryFn: () => api.listarAvaliacoesThumbnail(corteId),
  });

  const registrar = useMutation({
    mutationFn: (input: { veredito: VeredictoThumbnail; comDetalhes: boolean }) =>
      api.registrarAvaliacaoThumbnail(
        corteId,
        montarPayloadAvaliacao({
          veredito: input.veredito,
          notas: input.comDetalhes ? notas : undefined,
          comentario: input.comDetalhes ? comentario : '',
        }),
      ),
    onSuccess: () => {
      notify('Avaliação registrada.', { tone: 'success' });
      setNotas({});
      setComentario('');
      setDetalhar(false);
      void queryClient.invalidateQueries({ queryKey: avaliacoesKey(corteId) });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao registrar avaliação.', {
        tone: 'error',
      }),
  });

  const resumo = historicoQuery.data?.resumo;
  const avaliacoes = historicoQuery.data?.avaliacoes ?? [];
  const pending = registrar.isPending;

  return (
    <div className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
          <Star size={12} aria-hidden />
          Avaliar capa
        </span>
        {resumo && resumo.total > 0 && (
          <span className="font-code text-[10px] text-[var(--wb-text-dim)]">
            {resumo.positivos}/{resumo.total} bons
          </span>
        )}
      </div>

      {/* Caminho rápido: um clique registra com o veredito escolhido. */}
      <div className="grid grid-cols-2 gap-1.5">
        {VEREDITOS.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={pending}
            onClick={() => {
              setVeredito(item.value);
              registrar.mutate({ veredito: item.value, comDetalhes: false });
            }}
            className={cn(
              'h-8 rounded-[var(--radius-sm)] border px-2 text-xs font-semibold transition',
              veredito === item.value
                ? 'border-[var(--wb-accent)] text-[var(--wb-text)]'
                : 'border-[var(--wb-border)] text-[var(--wb-text-mute)] hover:border-[var(--wb-text-dim)]',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDetalhar((current) => !current)}
        className="flex items-center gap-1 self-start font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)] hover:text-[var(--wb-text-mute)]"
      >
        <ChevronDown
          size={12}
          className={cn('transition-transform', detalhar && 'rotate-180')}
          aria-hidden
        />
        Detalhar critérios
      </button>

      {detalhar && (
        <div className="grid gap-2 border-t border-[var(--wb-border-soft)] pt-2">
          {CRITERIOS.map((criterio) => (
            <div key={criterio.key} className="grid gap-1">
              <span className="text-xs text-[var(--wb-text-mute)]">{criterio.label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((nota) => (
                  <button
                    key={nota}
                    type="button"
                    onClick={() =>
                      setNotas((current) => ({
                        ...current,
                        [criterio.key]: current[criterio.key] === nota ? null : nota,
                      }))
                    }
                    className={cn(
                      'h-6 min-w-0 flex-1 rounded-[var(--radius-sm)] border text-[11px] font-semibold transition',
                      notas[criterio.key] === nota
                        ? 'border-[var(--wb-accent)] text-[var(--wb-text)]'
                        : 'border-[var(--wb-border)] text-[var(--wb-text-dim)] hover:border-[var(--wb-text-dim)]',
                    )}
                  >
                    {nota}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <textarea
            value={comentario}
            onChange={(event) => setComentario(event.target.value)}
            rows={2}
            placeholder="O que ficou bom/ruim? (opcional)"
            className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-2 text-xs text-[var(--wb-text-mute)] outline-none focus:border-[var(--wb-accent)]"
          />
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => registrar.mutate({ veredito, comDetalhes: true })}
            className="min-w-0"
            title={`Registrar “${rotuloVeredito(veredito)}” com critérios`}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Star />}
            <span className="truncate">Registrar com detalhes</span>
          </Button>
        </div>
      )}

      {avaliacoes.length > 0 && (
        <ul className="grid gap-1 border-t border-[var(--wb-border-soft)] pt-2">
          {avaliacoes.slice(0, 5).map((avaliacao) => (
            <li
              key={avaliacao.id}
              className="flex items-start justify-between gap-2 text-[11px] text-[var(--wb-text-mute)]"
            >
              <span className="font-semibold text-[var(--wb-text)]">
                {rotuloVeredito(avaliacao.veredito)}
              </span>
              {avaliacao.comentario && (
                <span
                  className="flex-1 truncate text-[var(--wb-text-dim)]"
                  title={avaliacao.comentario}
                >
                  {avaliacao.comentario}
                </span>
              )}
              <span className="font-code text-[10px] text-[var(--wb-text-dim)]">
                {formatarData(avaliacao.criado_em)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
