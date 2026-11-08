import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { Icon } from '@/upgrade/Icon';
import { IconeDaOrigem } from './CenaComOrigem';
import { ORIGENS } from './planoDasCenas';
import {
  descreverCampo,
  descreverRodada,
  linhaDaRodada,
  origemNaComparacao,
  resumirDiferencas,
  temRodada,
  type BotaoDoDesfazer,
  type RodadasDasCenas,
} from './regrasDaRodada';
import { metaCena } from './sceneTypes';
import { useRodadaDoPlano } from './useRodadaDoPlano';

// ─────────────────────────────────────────────────────────────────────────────
// A rodada no cabeçalho do plano de cenas (D-1073): quem gerou e quando, o "Desfazer
// rodada" (que também refaz) e o "Comparar com a rodada anterior".
//
// A comparação abre no Modal do app, como o Studio Remotion e o posicionamento desta
// mesma Pós. O painel do plano tem de 320 a 420 px e é onde o operador edita: um painel
// embutido empurraria a lista para baixo e espremeria o diff numa coluna estreita. A
// comparação é um momento de ler e decidir, que fecha no Esc e não sai da tela.
// ─────────────────────────────────────────────────────────────────────────────

type Cena = Record<string, unknown>;

export function RodadaDoPlano({ corteId, projetoId, dirty }: { corteId: string; projetoId: string; dirty: boolean }) {
  const { rodadas, falhou, agora, botao, desfazer, comparando, setComparando } = useRodadaDoPlano(corteId, projetoId, dirty);
  if (falhou && !rodadas) {
    return (
      <p role="status" className="mt-2 flex items-center gap-1 text-[11px] text-[var(--wb-warn)]">
        <Icon name="triangle-alert" />
        Não foi possível ler as rodadas das cenas: desfazer e comparar voltam quando a leitura der certo.
      </p>
    );
  }
  if (!temRodada(rodadas)) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid="rodada-do-plano">
      <p className="flex items-center gap-1 text-[11px] text-[var(--wb-text-mute)]">
        <Icon name="history" />
        {linhaDaRodada(rodadas, agora)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <BotaoDesfazer botao={botao} onClick={desfazer} idDoMotivo={`motivo-da-rodada-${corteId}`} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!rodadas.anterior}
          onClick={() => setComparando(true)}
          data-testid="comparar-rodadas"
        >
          <Icon name="git-compare-arrows" />
          Comparar com a rodada anterior
        </Button>
      </div>
      {botao.motivo && (
        <p id={`motivo-da-rodada-${corteId}`} className="text-[11px] text-[var(--wb-text-mute)]">
          {botao.motivo}
        </p>
      )}
      <Modal
        open={comparando}
        onClose={() => setComparando(false)}
        size="lg"
        title="Comparar com a rodada anterior"
        description={descreverAsDuas(rodadas, agora)}
        footer={
          <>
            <BotaoDesfazer botao={botao} onClick={desfazer} />
            <Button type="button" variant="outline" size="sm" onClick={() => setComparando(false)}>
              Fechar
            </Button>
          </>
        }
      >
        <ComparacaoDasRodadas rodadas={rodadas} />
      </Modal>
    </div>
  );
}

const descreverAsDuas = (rodadas: RodadasDasCenas, agora: number) =>
  rodadas.anterior
    ? `Atual: ${descreverRodada(rodadas.atual, agora)} · Anterior: ${descreverRodada(rodadas.anterior, agora)}`
    : undefined;

function BotaoDesfazer({ botao, onClick, idDoMotivo }: { botao: BotaoDoDesfazer; onClick: () => void; idDoMotivo?: string }) {
  return (
    <Tooltip label={botao.dica} side="top">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={botao.desabilitado}
        aria-label={botao.motivo ? botao.rotulo : `${botao.rotulo}. ${botao.dica}`}
        aria-describedby={botao.motivo ? idDoMotivo : undefined}
        data-testid="desfazer-rodada"
      >
        <Icon name={botao.trocando ? 'loader-2' : botao.icone} className={botao.trocando ? 'animate-spin' : undefined} />
        {botao.rotulo}
      </Button>
    </Tooltip>
  );
}

/** O que entrou, o que saiu e o que mudou, por cena, como a API compara (tipo + início). */
export function ComparacaoDasRodadas({ rodadas }: { rodadas: RodadasDasCenas }) {
  const { entraram, sairam, mudaram } = rodadas.diferencas;
  return (
    <div className="flex flex-col gap-3 text-[13px]" data-testid="comparacao-das-rodadas">
      <p className="font-semibold text-[var(--wb-text)]">{resumirDiferencas(rodadas.diferencas)}</p>
      <Grupo titulo="Entraram (só na atual)" vazio={entraram.length === 0}>
        {entraram.map((cena, i) => (
          <CenaDaComparacao key={`e-${i}`} cena={cena} />
        ))}
      </Grupo>
      <Grupo titulo="Saíram (só na anterior)" vazio={sairam.length === 0}>
        {sairam.map((cena, i) => (
          <CenaDaComparacao key={`s-${i}`} cena={cena} />
        ))}
      </Grupo>
      <Grupo titulo="Mudaram" vazio={mudaram.length === 0}>
        {mudaram.map((m, i) => (
          <CenaDaComparacao key={`m-${i}`} cena={m.atual}>
            <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-[var(--wb-text-mute)]">
              {m.campos.map((campo) => (
                <li key={campo}>{descreverCampo(campo, m.anterior, m.atual)}</li>
              ))}
            </ul>
          </CenaDaComparacao>
        ))}
      </Grupo>
    </div>
  );
}

function Grupo({ titulo, vazio, children }: { titulo: string; vazio: boolean; children: React.ReactNode }) {
  if (vazio) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-code text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">{titulo}</h3>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  );
}

function CenaDaComparacao({ cena, children }: { cena: Cena; children?: React.ReactNode }) {
  const origem = origemNaComparacao(cena);
  const tipo = metaCena(String(cena.tipo ?? '')).label;
  const inicio = Number(cena.inicio ?? 0).toFixed(1);
  const fim = Number(cena.fim ?? 0).toFixed(1);
  return (
    <li
      data-origem={origem ?? 'ia'}
      className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] border-l-[3px] px-2.5 py-2"
      style={origem ? { borderLeftColor: ORIGENS[origem].border, background: ORIGENS[origem].soft } : undefined}
    >
      <div className="flex justify-between gap-2 font-code text-[11px] text-[var(--wb-text-mute)]">
        <span>
          {inicio}s → {fim}s · {tipo}
        </span>
        {origem ? (
          <span className="font-sans font-semibold" style={{ color: ORIGENS[origem].color }}>
            <IconeDaOrigem origem={origem} />
            {ORIGENS[origem].rotulo}
          </span>
        ) : (
          <span className="font-sans">da IA</span>
        )}
      </div>
      <span className="block text-[13px] font-semibold text-[var(--wb-text)]">{String(cena.texto ?? '') || tipo}</span>
      {children}
    </li>
  );
}
