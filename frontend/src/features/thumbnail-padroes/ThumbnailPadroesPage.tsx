// D-070: tela global de "Padrões dos melhores prompts de thumbnail". Dispara o
// agente que lê as avaliações melhor pontuadas (D-066), mostra o que os melhores
// têm em comum (por eixo) e a proposta de ajuste para a skill do Capista, para o
// Paulo validar antes da edição manual da SKILL.md.
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { api, type PadroesThumbnailResponse } from '@/lib/api';
import { eixosComOcorrencias, rotuloEixo } from './thumbnailPadroes';

const FORCA_TONS: Record<string, string> = {
  alta: 'text-[var(--wb-ok)]',
  media: 'text-[var(--wb-warn)]',
  baixa: 'text-[var(--wb-text-dim)]',
};

export function ThumbnailPadroesPage() {
  const { notify } = useToast();

  const analise = useMutation<PadroesThumbnailResponse>({
    mutationFn: () => api.analisarPadroesThumbnail(),
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao analisar padrões.', {
        tone: 'error',
      }),
  });

  const resultado = analise.data;
  const insuficiente = resultado?.status === 'dados_insuficientes';
  const eixos = eixosComOcorrencias(resultado?.padroes ?? null);

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
      <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-7 py-5">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]">
            <Sparkles size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to="/projetos"
              className="mb-1.5 inline-flex items-center gap-1.5 text-sm text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
            >
              <ArrowLeft size={14} aria-hidden />
              Voltar
            </Link>
            <h1 className="font-editorial text-[48px] font-medium leading-[0.96] tracking-[-0.01em] text-[var(--wb-text)]">
              Padrões de thumbnail
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] text-[var(--wb-text-mute)]">
              Lê as capas melhor avaliadas e mostra o que os melhores prompts têm em comum, com uma
              proposta de ajuste para a skill do Capista. Valide os padrões antes de aplicar.
            </p>
          </div>
          <Button type="button" onClick={() => analise.mutate()} disabled={analise.isPending}>
            {analise.isPending ? <Loader2 className="animate-spin" /> : <Wand2 aria-hidden />}
            Analisar padrões
          </Button>
        </div>
      </header>

      <main className="grid flex-1 content-start gap-5 overflow-auto p-6">
        {!resultado && !analise.isPending && (
          <p className="text-[15px] text-[var(--wb-text-mute)]">
            Clique em <strong>Analisar padrões</strong> para extrair os padrões dos melhores prompts
            avaliados.
          </p>
        )}

        {analise.isPending && (
          <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
            <Loader2 className="animate-spin" size={16} aria-hidden />
            Analisando os melhores prompts…
          </p>
        )}

        {insuficiente && (
          <div className="rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5 text-[15px] text-[var(--wb-text-mute)]">
            Ainda não há avaliações boas suficientes para extrair padrões. Foram encontradas{' '}
            <strong>{resultado?.total_melhores ?? 0}</strong> capas bem avaliadas (mínimo de{' '}
            <strong>{resultado?.minimo ?? 3}</strong>). Avalie mais capas como “Ótimo/Bom” e tente de
            novo.
          </div>
        )}

        {resultado?.status === 'ok' && resultado.analise && (
          <>
            <section className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
              <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Resumo · {resultado.total_melhores} melhores de {resultado.total_avaliacoes}
              </h2>
              <p className="text-[15px] text-[var(--wb-text)]">{resultado.analise.resumo}</p>
            </section>

            <section className="grid gap-3">
              <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Padrões identificados
              </h2>
              <ul className="grid gap-2">
                {resultado.analise.padroes.map((padrao, indice) => (
                  <li
                    key={`${padrao.eixo}-${indice}`}
                    className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-[var(--wb-text)]">
                        {rotuloEixo(padrao.eixo)}: {padrao.padrao}
                      </span>
                      <span
                        className={`font-code text-[10px] uppercase tracking-[0.08em] ${
                          FORCA_TONS[padrao.forca] ?? 'text-[var(--wb-text-dim)]'
                        }`}
                      >
                        {padrao.forca}
                      </span>
                    </div>
                    {padrao.evidencia && (
                      <p className="text-[13px] text-[var(--wb-text-mute)]">{padrao.evidencia}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] p-5">
              <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-accent)]">
                Proposta de ajuste na skill do Capista
              </h2>
              <p className="whitespace-pre-wrap text-[15px] text-[var(--wb-text)]">
                {resultado.analise.proposta_ajuste_skill}
              </p>
              <p className="mt-1 text-[12px] text-[var(--wb-text-mute)]">
                A edição da SKILL.md é manual e só acontece depois que você validar estes padrões.
              </p>
            </section>

            {eixos.length > 0 && (
              <section className="grid gap-3">
                <h2 className="font-code text-[11px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                  Frequência por eixo (dados brutos · {resultado.com_tags ?? 0} com tags)
                </h2>
                <ul className="grid gap-2">
                  {eixos.map(({ eixo, rotulo, ocorrencias }) => (
                    <li
                      key={eixo}
                      className="grid gap-1 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-3"
                    >
                      <span className="font-code text-[10px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                        {rotulo}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ocorrencias.map((ocorrencia) => (
                          <span
                            key={ocorrencia.valor}
                            className="rounded-[var(--radius-sm)] border border-[var(--wb-border)] px-2 py-0.5 text-[12px] text-[var(--wb-text-mute)]"
                          >
                            {ocorrencia.valor}
                            {ocorrencia.contagem > 1 && (
                              <span className="ml-1 text-[var(--wb-text-dim)]">×{ocorrencia.contagem}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
