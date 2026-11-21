// D-066: avaliação do par prompt+imagem de thumbnail, ao lado da capa.
// Caminho rápido: um clique no veredito ("Ótimo/Bom/Regular/Ruim") registra na
// hora. Caminho detalhado: critérios (1-5) + comentário. O histórico acumulado
// alimenta, mais adiante, um agente que procura o que os melhores têm em comum.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  CRITERIOS,
  VEREDITOS,
  montarPayloadAvaliacao,
  rotuloVeredito,
  type NotasState,
} from './thumbnailAvaliacao';
import { avaliacaoThumbnailApi, type VeredictoThumbnail } from './api/avaliacaoThumbnail';

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
    queryFn: () => avaliacaoThumbnailApi.listar(corteId),
  });

  const registrar = useMutation({
    mutationFn: (input: { veredito: VeredictoThumbnail; comDetalhes: boolean }) =>
      avaliacaoThumbnailApi.registrar(
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
    <section aria-label="Avaliar capa" className="grid gap-2 rounded-bloco border border-fio bg-vidro p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-pequeno text-fg-2">
          <Icon name="star" />
          Avaliar capa
        </span>
        {resumo && resumo.total > 0 && (
          <span className="num text-fg-3">
            {resumo.positivos}/{resumo.total} bons
          </span>
        )}
      </div>

      {/* Caminho rápido: um clique registra com o veredito escolhido. */}
      <div className="grid grid-cols-2 gap-1.5">
        {VEREDITOS.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant="secundario"
            size="pq"
            disabled={pending}
            aria-pressed={veredito === item.value}
            onClick={() => {
              setVeredito(item.value);
              registrar.mutate({ veredito: item.value, comDetalhes: false });
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <button
        type="button"
        aria-expanded={detalhar}
        onClick={() => setDetalhar((current) => !current)}
        data-sala=""
        className="flex items-center gap-1 self-start rounded-etiqueta text-pequeno text-fg-3 transition-colors hover:text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco motion-reduce:transition-none"
      >
        <Icon name="chevron-down" className={cn('transition-transform motion-reduce:transition-none', detalhar && 'rotate-180')} />
        Detalhar critérios
      </button>

      {detalhar && (
        <div className="grid gap-2 border-t border-fio pt-2">
          {CRITERIOS.map((criterio) => (
            <div key={criterio.key} role="group" aria-label={criterio.label} className="grid gap-1">
              <span className="text-pequeno text-fg-2">{criterio.label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((nota) => (
                  <Chip
                    key={nota}
                    pressionado={notas[criterio.key] === nota}
                    className="min-w-0 flex-1 justify-center px-0"
                    onClick={() =>
                      setNotas((current) => ({
                        ...current,
                        [criterio.key]: current[criterio.key] === nota ? null : nota,
                      }))
                    }
                  >
                    {nota}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          <Textarea
            value={comentario}
            onChange={(event) => setComentario(event.target.value)}
            rows={2}
            aria-label="Comentário sobre a capa"
            placeholder="O que ficou bom/ruim? (opcional)"
            className="min-h-0 text-pequeno"
          />
          <Button
            type="button"
            size="pq"
            variant="secundario"
            carregando={pending}
            onClick={() => registrar.mutate({ veredito, comDetalhes: true })}
            className="min-w-0"
            title={`Registrar “${rotuloVeredito(veredito)}” com critérios`}
          >
            <Icon name="star" />
            <span className="truncate">Registrar com detalhes</span>
          </Button>
        </div>
      )}

      {avaliacoes.length > 0 && (
        <ul className="grid gap-1 border-t border-fio pt-2">
          {avaliacoes.slice(0, 5).map((avaliacao) => (
            <li key={avaliacao.id} className="flex items-start justify-between gap-2 text-pequeno text-fg-2">
              <span className="text-fg">{rotuloVeredito(avaliacao.veredito)}</span>
              {avaliacao.comentario && (
                <span className="flex-1 truncate text-fg-3" title={avaliacao.comentario}>
                  {avaliacao.comentario}
                </span>
              )}
              <span className="num text-fg-3">{formatarData(avaliacao.criado_em)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
