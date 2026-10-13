// D-908: seção "Horários de publicação" na página de Canais. Container:
// orquestra o I/O (hooks em useEscalonamento) e delega à grade do público e ao
// formulário de cada destino. É daqui que o lote de shorts tira a janela do canal.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { escalonamentoApi } from '@/features/channels/api/escalonamento';
import { mensagemErro } from '@/lib/mensagemErro';
import { Icon } from '@/upgrade/Icon';
import { BlocosDoDestinoForm } from './BlocosDoDestinoForm';
import { ReferenciaDoPublicoGrade } from './ReferenciaDoPublicoGrade';
import {
  faixasDaGrade,
  gradeDasFaixas,
  gradesIguais,
  trocarCelula,
  type GradeDoPublico,
} from './escalonamentoPublico';
import {
  useEscalonamento,
  useResetarEscalonamento,
  useSalvarDestino,
  useSalvarPublico,
} from './useEscalonamento';

export function EscalonamentoSection() {
  const { notify } = useToast();
  const query = useEscalonamento();
  const salvarPublico = useSalvarPublico();
  const salvarDestino = useSalvarDestino();
  const resetar = useResetarEscalonamento();
  const pending = salvarPublico.isPending || salvarDestino.isPending || resetar.isPending;

  const dados = query.data;
  const gradeDoCanal = dados ? gradeDasFaixas(dados.faixas) : null;
  const [grade, setGrade] = useState<GradeDoPublico | null>(null);
  useEffect(() => {
    if (gradeDoCanal) setGrade(gradeDoCanal);
    // A grade local nasce (e renasce) do que o canal tem gravado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados?.faixas]);

  const avisarErro = (erro: unknown, fallback: string) =>
    notify(mensagemErro(erro, fallback), { tone: 'error' });

  const aoSalvarPublico = () => {
    if (!grade) return;
    salvarPublico.mutate(faixasDaGrade(grade), {
      onSuccess: () => notify('Referência do público gravada.', { tone: 'success' }),
      onError: (erro) => avisarErro(erro, 'Erro ao gravar a referência.'),
    });
  };

  const aoResetar = (chave: string, rotulo: string) => {
    resetar.mutate(chave, {
      onSuccess: () => notify(`${rotulo}: de volta ao padrão.`, { tone: 'info' }),
      onError: (erro) => avisarErro(erro, 'Erro ao resetar.'),
    });
  };

  const gradeMudou = Boolean(grade && gradeDoCanal && !gradesIguais(grade, gradeDoCanal));

  return (
    <section className="grid gap-4 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--wb-text)]">Horários de publicação</h2>
        <p className="mt-1 text-sm text-[var(--wb-text-mute)]">
          Um lote de shorts lançado de uma vez disputa as mesmas impressões; o YouTube trata uma
          cadência inumana como sinal de conteúdo inautêntico. Com a janela do canal, o lote
          "distribuir pela janela" espaça cada item nos blocos abaixo, enche o dia e passa para o
          seguinte — partindo do último já agendado naquela rede.
        </p>
      </div>

      {query.isLoading && (
        <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
          <Icon name="loader-2" size={16} className="animate-spin" />
          Carregando…
        </p>
      )}

      {query.isError && (
        <div className="grid gap-3 rounded-[var(--radius)] border border-error/30 p-4">
          <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text)]">
            <Icon name="triangle-alert" size={16} className="text-error" />
            {mensagemErro(query.error, 'Não foi possível carregar os horários.')}
          </p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {dados && grade && (
        <>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-bold text-[var(--wb-text)]">
                Quando o público está lá
              </h3>
              {dados.publico_personalizado && (
                <span className="rounded-full border border-[var(--wb-border-soft)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--wb-text-dim)]">
                  personalizado
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--wb-text-mute)]">
              Copie do relatório "Quando seus espectadores estão no YouTube" (Studio → Público):
              pinte forte onde o mapa está escuro. Atualize de tempos em tempos; o padrão é a
              leitura de um canal de tarde/noite.
            </p>
            <ReferenciaDoPublicoGrade
              grade={grade}
              diasDaSemana={dados.dias_da_semana}
              onTrocar={(dia, hora) => setGrade((atual) => atual && trocarCelula(atual, dia, hora))}
              desabilitado={pending}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => aoResetar('publico', 'Referência do público')}
                disabled={pending || !dados.publico_personalizado}
                className="inline-flex items-center gap-1 text-xs text-[var(--wb-text-mute)] hover:text-[var(--wb-text)] disabled:opacity-40"
              >
                <Icon name="rotate-ccw" />
                Voltar ao padrão
              </button>
              <Button type="button" size="sm" disabled={pending || !gradeMudou} onClick={aoSalvarPublico}>
                Salvar referência
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            <h3 className="text-[13px] font-bold text-[var(--wb-text)]">Blocos por rede</h3>
            {dados.destinos.map((destino) => (
              <BlocosDoDestinoForm
                key={destino.destino}
                destino={destino}
                diasDaSemana={dados.dias_da_semana}
                pending={pending}
                onSave={(parametros) =>
                  salvarDestino.mutate(
                    { destino: destino.destino, parametros },
                    {
                      onSuccess: () => notify(`${destino.rotulo}: blocos gravados.`, { tone: 'success' }),
                      onError: (erro) => avisarErro(erro, 'Erro ao gravar os blocos.'),
                    },
                  )
                }
                onReset={() => aoResetar(destino.destino, destino.rotulo)}
                onSugerir={async () => (await escalonamentoApi.sugerirBlocos(destino.destino)).blocos}
              />
            ))}
            <p className="text-[11px] text-[var(--wb-text-mute)]">
              O Instagram Reels fica fora: o compositor do instagram.com não agenda — nem emulando
              celular, que nem vídeo aceita (medido em 13/10/2026). Ele publica no ato, e o lote
              avisa.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
