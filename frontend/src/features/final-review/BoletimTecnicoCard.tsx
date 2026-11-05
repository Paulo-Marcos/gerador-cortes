import { type RefObject, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useShortsDoCorte } from '@/features/shorts/useShortsDoCorte';
import { Icon } from '@/upgrade/Icon';
import {
  type AlvoDoBoletim,
  type BoletimTecnico,
  linhaDeEmendas,
  linhaDeParada,
  linhaDeVolume,
  relogio,
  TEXTO_DA_REFERENCIA,
  TEXTO_QUE_NAO_BLOQUEIA,
  totalDeAvisos,
} from './boletimTecnico';
import { useBoletimTecnico, useRemedirBoletim } from './useBoletimTecnico';

// D-1015: o boletim técnico do vídeo, na Revisão Final. Medição sem IA, feita em
// segundo plano depois do render; a tela só mostra e AVISA — não bloqueia nada.

const ROTULO_DO_TITULO =
  'font-code text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]';

export type OpcaoDoBoletim = { alvo: AlvoDoBoletim; rotulo: string };

const chaveDaOpcao = (o: OpcaoDoBoletim) => `${o.alvo.tipo}:${o.alvo.id}`;

function levarAoInstante(player: RefObject<HTMLVideoElement | null>, segundos: number) {
  if (player.current) player.current.currentTime = segundos;
}

export function BoletimTecnicoPainel({
  corteId,
  player,
}: {
  corteId: string;
  /** D-1044: o vídeo da Revisão, que a parada e a emenda levam ao instante delas. */
  player?: RefObject<HTMLVideoElement | null>;
}) {
  const shortsQ = useShortsDoCorte(corteId);
  const [escolhido, setEscolhido] = useState<string>(`corte:${corteId}`);
  const opcoes: OpcaoDoBoletim[] = [
    { alvo: { tipo: 'corte', id: corteId }, rotulo: 'Horizontal' },
    ...(shortsQ.data?.shorts ?? [])
      .filter((s) => s.status === 'renderizado')
      .map((s) => ({ alvo: { tipo: 'short' as const, id: s.id }, rotulo: `Short ${s.numero}` })),
  ];
  const atual = opcoes.find((o) => chaveDaOpcao(o) === escolhido) ?? opcoes[0];
  const boletimQ = useBoletimTecnico(atual.alvo);
  const remedir = useRemedirBoletim(atual.alvo);
  return (
    <BoletimTecnicoCard
      boletim={boletimQ.data}
      erroDaConsulta={boletimQ.isError}
      opcoes={opcoes}
      escolhido={atual}
      onEscolher={(o) => setEscolhido(chaveDaOpcao(o))}
      onRemedir={() => remedir.mutate()}
      remedindo={remedir.isPending}
      // O player da Revisão é o do horizontal: instante de short não se aplica a ele.
      onIrPara={atual.alvo.tipo === 'corte' && player ? (seg) => levarAoInstante(player, seg) : undefined}
    />
  );
}

export function BoletimTecnicoCard({
  boletim,
  erroDaConsulta = false,
  opcoes,
  escolhido,
  onEscolher,
  onRemedir,
  remedindo = false,
  onIrPara,
}: {
  boletim: BoletimTecnico | undefined;
  erroDaConsulta?: boolean;
  opcoes: OpcaoDoBoletim[];
  escolhido: OpcaoDoBoletim;
  onEscolher: (opcao: OpcaoDoBoletim) => void;
  onRemedir: () => void;
  remedindo?: boolean;
  onIrPara?: (segundos: number) => void;
}) {
  const pronto = boletim?.estado === 'pronto';
  const avisos = pronto ? totalDeAvisos(boletim) : 0;
  return (
    <section
      aria-label="Boletim técnico"
      className="flex-shrink-0 overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <span className={ROTULO_DO_TITULO}>Boletim técnico</span>
        {pronto && (
          <span
            className={`rounded-full px-2 py-0.5 font-code text-[11px] font-bold uppercase tracking-[0.04em] ${
              avisos === 0
                ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]'
                : 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn)]'
            }`}
          >
            {avisos === 0 ? 'sem avisos' : `${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}`}
          </span>
        )}
      </header>
      {opcoes.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-1 px-3 pt-3">
          {opcoes.map((o) => {
            const ativo = chaveDaOpcao(o) === chaveDaOpcao(escolhido);
            return (
              <button
                key={chaveDaOpcao(o)}
                role="tab"
                type="button"
                aria-selected={ativo}
                onClick={() => onEscolher(o)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                  ativo
                    ? 'border-[var(--wb-text-mute)] bg-[var(--wb-bg-inset)] text-[var(--wb-text)]'
                    : 'border-[var(--wb-border-soft)] text-[var(--wb-text-mute)]'
                }`}
              >
                {o.rotulo}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-col gap-3 p-3 text-[12.5px] text-[var(--wb-text)]">
        <Corpo
          boletim={boletim}
          erroDaConsulta={erroDaConsulta}
          onRemedir={onRemedir}
          remedindo={remedindo}
          onIrPara={onIrPara}
        />
      </div>
    </section>
  );
}

/** O texto vira link para o instante quando a tela tem um player para levar. */
function NoInstante({
  segundos,
  onIrPara,
  children,
}: {
  segundos: number;
  onIrPara?: (segundos: number) => void;
  children: React.ReactNode;
}) {
  if (!onIrPara) return <>{children}</>;
  return (
    <button
      type="button"
      className="text-left underline"
      title={`Ir para ${relogio(segundos)} no vídeo`}
      onClick={() => onIrPara(segundos)}
    >
      {children}
    </button>
  );
}

function Corpo({
  boletim,
  erroDaConsulta,
  onRemedir,
  remedindo,
  onIrPara,
}: {
  boletim: BoletimTecnico | undefined;
  erroDaConsulta: boolean;
  onRemedir: () => void;
  remedindo: boolean;
  onIrPara?: (segundos: number) => void;
}) {
  if (erroDaConsulta) {
    return <p className="text-[var(--wb-warn)]">Não consegui consultar o boletim agora.</p>;
  }
  if (!boletim || boletim.estado === 'medindo') {
    return (
      <p className="flex items-center gap-2 text-[var(--wb-text-mute)]">
        <Icon name="loader-2" className="animate-spin" />
        Medindo o vídeo… leva alguns minutos e roda em segundo plano.
      </p>
    );
  }
  if (boletim.estado === 'arquivo_ausente') {
    return (
      <p className="text-[var(--wb-text-mute)]">
        Este vídeo não está mais no disco (a limpeza apaga a mídia já publicada), então não há o que
        medir.
      </p>
    );
  }
  if (boletim.estado === 'falhou') {
    return (
      <>
        <p className="text-[var(--wb-warn)]">
          A medição não terminou: {boletim.erro ?? 'erro desconhecido'}
        </p>
        <MedirDeNovo onRemedir={onRemedir} remedindo={remedindo} />
      </>
    );
  }
  return (
    <>
      <Bloco titulo="Volume">
        {boletim.volume && (
          <>
            <p>{linhaDeVolume(boletim.volume)}</p>
            {boletim.volume.avisos.map((a) => (
              <p key={a} className="text-[var(--wb-warn)]">
                {a}
              </p>
            ))}
            <p className="text-[11px] text-[var(--wb-text-mute)]">{TEXTO_DA_REFERENCIA}</p>
          </>
        )}
      </Bloco>
      <Bloco titulo="Imagem parada">
        {boletim.paradas?.length ? (
          <ul className="flex flex-col gap-0.5">
            {boletim.paradas.map((p) => (
              <li key={p.inicio_seg} className="text-[var(--wb-warn)]">
                <NoInstante segundos={p.inicio_seg} onIrPara={onIrPara}>
                  {linhaDeParada(p)}
                </NoInstante>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma parada de imagem.</p>
        )}
      </Bloco>
      <Bloco titulo="Emendas">
        {boletim.emendas ? (
          <>
            <p>{linhaDeEmendas(boletim.emendas)}</p>
            {boletim.emendas.itens
              .filter((e) => e.acima_do_p99)
              .map((e) => (
                <p key={e.tempo_seg} className="text-[var(--wb-warn)]">
                  <NoInstante segundos={e.tempo_seg} onIrPara={onIrPara}>
                    {`${relogio(e.tempo_seg)} · degrau acima do normal da fala`}
                  </NoInstante>
                </p>
              ))}
          </>
        ) : (
          <p className="text-[var(--wb-text-mute)]">
            {boletim.emendas_aviso ?? 'As emendas não foram medidas.'}
          </p>
        )}
      </Bloco>
      <p className="text-[11px] text-[var(--wb-text-mute)]">{TEXTO_QUE_NAO_BLOQUEIA}</p>
      <MedirDeNovo onRemedir={onRemedir} remedindo={remedindo} />
    </>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className={ROTULO_DO_TITULO}>{titulo}</h3>
      {children}
    </div>
  );
}

function MedirDeNovo({ onRemedir, remedindo }: { onRemedir: () => void; remedindo: boolean }) {
  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={onRemedir} disabled={remedindo}>
        <Icon name="refresh-cw" />
        Medir de novo
      </Button>
    </div>
  );
}
