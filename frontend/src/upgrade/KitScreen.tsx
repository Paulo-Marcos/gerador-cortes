import { useState } from 'react';
import { Icon, type IconName } from './Icon';
import {
  ModalFields,
  ModalItems,
  ModalScore,
  ModalSteps,
  ModalText,
  UpgradeModal,
  type ModalField,
  type ModalItem,
  type ModalStep,
} from './UpgradeModal';
import { UpgradeToast } from './UpgradeToast';

// ─────────────────────────────────────────────────────────────────
// D-599 · Tela "Componentes" do handoff.
//
// Não é vitrine decorativa: é o lugar onde a fundação se prova antes
// de qualquer tela real migrar. Se um botão, um chip ou um modal
// ficarem errados aqui, ficam errados em dezessete telas — e barato
// é consertar enquanto o erro mora num arquivo só.
//
// Os dados são os do protótipo, literais, para a comparação lado a
// lado com o .dc.html ser direta.
// ─────────────────────────────────────────────────────────────────

const A = 'var(--accent)';
const A2 = 'var(--accent2)';
const OK = 'var(--ok)';
const W = 'var(--warn)';
const I = 'var(--info)';
const M = 'var(--mute)';
const ERR = 'var(--err)';

const CHIPS = [
  { t: 'proposto', bg: 'var(--info-soft)', cor: I },
  { t: 'aprovado', bg: 'var(--accent-soft)', cor: A2 },
  { t: 'pronto', bg: 'var(--ok-soft)', cor: OK },
  { t: 'rejeitado', bg: 'var(--inset)', cor: M },
  { t: 'sem bruto', bg: 'var(--warn-soft)', cor: W },
  { t: 'falhou', bg: 'var(--err-soft)', cor: ERR },
];

const NOTAS = [
  { v: '8.7', bg: 'var(--ok-soft)', cor: OK },
  { v: '7.9', bg: 'var(--info-soft)', cor: I },
  { v: '6.4', bg: 'var(--accent-soft)', cor: A2 },
  { v: '5.1', bg: 'var(--inset)', cor: M },
];

const AVISOS: Array<{
  n: IconName;
  t: string;
  d: string;
  acao: string;
  cor: string;
  borda: string;
}> = [
  {
    n: 'circle-check',
    t: 'Bruto guardado',
    d: 'O recorte de 18:32 está no disco — a curadoria pode começar.',
    acao: 'Abrir',
    cor: OK,
    borda: 'var(--ok-soft)',
  },
  {
    n: 'triangle-alert',
    t: 'Disco quase cheio',
    d: '4 lives antigas ocupam 1,8 GB e já foram publicadas.',
    acao: 'Limpar',
    cor: W,
    borda: 'var(--warn-soft)',
  },
  {
    n: 'x',
    t: 'Falha no encode',
    d: 'O render do corte #12 parou no frame 940 — log disponível.',
    acao: 'Ver log',
    cor: ERR,
    borda: 'var(--err-soft)',
  },
];

// ── Demonstração dos modais ──────────────────────────────────────

type ModalKey =
  | 'novaLive'
  | 'publicar'
  | 'render'
  | 'nota'
  | 'auditoria'
  | 'padroes'
  | 'confirmar';

const BOTOES_MODAL: Array<{ n: IconName; t: string; k: ModalKey }> = [
  { n: 'plus', t: 'Nova live', k: 'novaLive' },
  { n: 'send', t: 'Publicar em massa', k: 'publicar' },
  { n: 'rocket', t: 'Render', k: 'render' },
  { n: 'flame', t: 'Nota do corte', k: 'nota' },
  { n: 'brain', t: 'Auditoria', k: 'auditoria' },
  { n: 'sparkles', t: 'Gerar com IA', k: 'padroes' },
  { n: 'triangle-alert', t: 'Confirmação', k: 'confirmar' },
];

const ITENS_PUBLICAR: ModalItem[] = [
  {
    num: '#7',
    titulo: 'O erro do BC em 40 segundos',
    estado: 'pronto',
    marcado: true,
    chipBg: 'var(--ok-soft)',
    chipCor: OK,
  },
  {
    num: '#8',
    titulo: 'Selic e o seu aluguel',
    estado: 'aprovado',
    marcado: true,
    chipBg: 'var(--accent-soft)',
    chipCor: A2,
  },
  {
    num: '#9',
    titulo: 'Quem lucra com juros altos',
    estado: 'proposto',
    marcado: true,
    chipBg: 'var(--info-soft)',
    chipCor: I,
  },
  {
    num: '#10',
    titulo: 'A dívida pública em 3 minutos',
    estado: 'publicado',
    marcado: false,
    chipBg: 'var(--inset)',
    chipCor: M,
  },
  {
    num: '#11',
    titulo: 'Resposta ao inscrito sobre FIIs',
    estado: 'aprovado',
    marcado: false,
    chipBg: 'var(--accent-soft)',
    chipCor: A2,
  },
];

const ETAPAS_RENDER: ModalStep[] = [
  {
    icone: 'download',
    titulo: 'Recorte do bruto',
    pct: '100%',
    hint: 'feito',
    barra: OK,
    bg: 'var(--ok-soft)',
    cor: OK,
  },
  {
    icone: 'image',
    titulo: 'Grade de cor',
    pct: '100%',
    hint: 'feito',
    barra: OK,
    bg: 'var(--ok-soft)',
    cor: OK,
  },
  {
    icone: 'captions',
    titulo: 'Legenda e overlays',
    pct: '62%',
    hint: '4 min',
    barra: A,
    bg: A,
    cor: 'var(--on-accent)',
  },
  {
    icone: 'rocket',
    titulo: 'Encode final 1080×1920',
    pct: '0%',
    hint: 'na espera',
    barra: 'var(--inset)',
    bg: 'var(--inset)',
    cor: 'var(--dim)',
  },
];

const CAMPOS_NOVA_LIVE: ModalField[] = [
  { label: 'URL da live', value: 'https://youtube.com/watch?v=aX7kQ2…', hint: 'colada' },
  { label: 'Título de trabalho', value: 'LIVE 268 — Perguntas sobre dólar' },
  { label: 'Canal', value: '@seucanal' },
];

const CAMPOS_AUDITORIA: ModalField[] = [
  { label: 'Modelo', value: 'claude-sonnet · 2 chamadas' },
  { label: 'Custo', value: 'US$ 0,18' },
  { label: 'Trechos propostos', value: '14 · 8 aprovados por você' },
  { label: 'Desvio médio da borda', value: '+2,4 s ao entrar · -1,1 s ao sair' },
];

const ITENS_PADROES: ModalItem[] = [
  {
    num: '1',
    titulo: 'Título do YouTube',
    estado: 'incluir',
    marcado: true,
    chipBg: 'var(--accent-soft)',
    chipCor: A2,
  },
  {
    num: '2',
    titulo: 'Descrição com marcações de tempo',
    estado: 'incluir',
    marcado: true,
    chipBg: 'var(--accent-soft)',
    chipCor: A2,
  },
  {
    num: '3',
    titulo: 'Tags do vídeo',
    estado: 'incluir',
    marcado: true,
    chipBg: 'var(--accent-soft)',
    chipCor: A2,
  },
  {
    num: '4',
    titulo: 'Prompt da capa',
    estado: 'manter o meu',
    marcado: false,
    chipBg: 'var(--inset)',
    chipCor: M,
  },
];

function ModalDemo({ aberto, fechar }: { aberto: ModalKey | null; fechar: () => void }) {
  const [nota, setNota] = useState(4);
  const props = { open: true, onClose: fechar } as const;

  switch (aberto) {
    case 'novaLive':
      return (
        <UpgradeModal
          {...props}
          icon="plus"
          title="Nova live"
          subtitle="cole a URL do YouTube — o app baixa, transcreve e propõe os cortes"
          footerNote="download estimado: 1,4 GB"
          primaryLabel="Baixar e analisar"
          primaryIcon="download"
        >
          <ModalFields fields={CAMPOS_NOVA_LIVE} />
        </UpgradeModal>
      );
    case 'publicar':
      return (
        <UpgradeModal
          {...props}
          icon="send"
          title="Publicar em massa"
          subtitle="3 de 5 cortes selecionados · agendamento em intervalos de 2 h"
          width="560px"
          footerNote="o lote só libera com render, título e capa prontos"
          primaryLabel="Agendar 3 cortes"
          primaryIcon="clock"
        >
          <ModalItems items={ITENS_PUBLICAR} />
          <ModalFields
            fields={[
              { label: 'Primeira publicação', value: 'Ter, 16 set · 18:00' },
              { label: 'Destinos', value: 'YouTube Shorts · TikTok' },
            ]}
          />
        </UpgradeModal>
      );
    case 'render':
      return (
        <UpgradeModal
          {...props}
          icon="rocket"
          title="Renderizar final"
          subtitle="corte #7 · 1080×1920 · legenda queimada"
          footerNote="tempo estimado: 7 min"
          secondaryLabel="Fechar"
          primaryLabel="Recomeçar da legenda"
          primaryIcon="rotate-ccw"
        >
          <ModalSteps steps={ETAPAS_RENDER} />
          <ModalText>
            Recomeçar da legenda reaproveita a grade já pronta e economiza cerca de 6 minutos.
          </ModalText>
        </UpgradeModal>
      );
    case 'nota':
      return (
        <UpgradeModal
          {...props}
          icon="flame"
          title="Nota do corte"
          subtitle="quanto este corte merece virar short — a nota alimenta o ranking da IA"
          width="440px"
          footerNote="marcada como fire automaticamente a partir de 4"
          primaryLabel="Salvar nota"
          primaryIcon="check"
        >
          <ModalScore
            value={nota}
            onPick={setNota}
            help="4 — bom gancho, fecha sozinho, exemplo concreto no meio."
          />
          <ModalFields
            fields={[
              {
                label: 'Observação',
                value: 'segurar o corte até a live de quinta para casar com o tema',
                height: '54px',
              },
            ]}
          />
        </UpgradeModal>
      );
    case 'auditoria':
      return (
        <UpgradeModal
          {...props}
          icon="brain"
          title="Auditoria da análise"
          subtitle="o que a IA leu, o que propôs e quanto custou"
          width="560px"
          footerNote="última análise há 2 dias"
          secondaryLabel="Fechar"
          primaryLabel="Reanalisar live"
          primaryIcon="rotate-ccw"
          primaryStrong={false}
        >
          <ModalFields fields={CAMPOS_AUDITORIA} />
          <ModalText>
            Os cortes aprovados ficaram em média 2,4 s à frente do que a IA propôs na entrada — o
            prompt já foi ajustado para antecipar o gancho.
          </ModalText>
        </UpgradeModal>
      );
    case 'padroes':
      return (
        <UpgradeModal
          {...props}
          icon="wand"
          title="Gerar com IA"
          subtitle="o que será escrito para este corte"
          width="500px"
          footerNote="custo estimado: US$ 0,04"
          primaryLabel="Gerar 3 itens"
          primaryIcon="sparkles"
        >
          <ModalItems items={ITENS_PADROES} />
        </UpgradeModal>
      );
    case 'confirmar':
      return (
        <UpgradeModal
          {...props}
          icon="triangle-alert"
          iconBg="var(--err-soft)"
          iconColor={ERR}
          title="Regerar o bruto deste corte?"
          subtitle="esta ação descarta o que já foi renderizado"
          width="440px"
          footerNote="não dá para desfazer"
          primaryLabel="Regerar bruto"
          primaryIcon="rotate-ccw"
        >
          <ModalText>
            O arquivo final, a grade de cor e as legendas queimadas serão apagados. Os trechos
            aprovados e o texto dos ganchos permanecem.
          </ModalText>
        </UpgradeModal>
      );
    default:
      return null;
  }
}

// ── A tela ───────────────────────────────────────────────────────

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="lbl">{titulo}</span>
      {children}
    </div>
  );
}

export function KitScreen() {
  const [modal, setModal] = useState<ModalKey | null>(null);
  const [toast, setToast] = useState(true);

  return (
    <div
      data-screen-label="Componentes"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1080 }}
    >
      <Secao titulo="Botões · 30 px · cantos de 4 px">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          <button type="button" className="btn btn-pri">
            <Icon name="check" size={13} />
            Primário
            <kbd style={{ background: 'rgb(255 255 255/.2)', borderColor: 'transparent', color: 'inherit' }}>
              ↵
            </kbd>
          </button>
          <button type="button" className="btn">
            <Icon name="eye" size={13} />
            Secundário
          </button>
          <button
            type="button"
            className="btn"
            style={{ borderColor: 'transparent', background: 'none', boxShadow: 'none', color: M }}
          >
            <Icon name="x" size={13} />
            Fantasma
          </button>
          <button type="button" className="btn" style={{ color: ERR, borderColor: 'var(--err-soft)' }}>
            <Icon name="trash" size={13} />
            Perigo
          </button>
          <button type="button" className="btn btn-icon">
            <Icon name="more-horizontal" size={14} />
          </button>
          <span
            style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 'var(--r2)', background: 'var(--inset)' }}
          >
            <button type="button" className="btn" style={{ height: 26, border: 0, boxShadow: 'var(--shadow)' }}>
              Palco
            </button>
            <button
              type="button"
              className="btn"
              style={{ height: 26, border: 0, background: 'none', boxShadow: 'none', color: M }}
            >
              Legenda
            </button>
          </span>
          <button type="button" className="btn" disabled style={{ opacity: 0.45 }}>
            <Icon name="loader" size={13} />
            Processando…
          </button>
        </div>
      </Secao>

      <Secao titulo="Estados, notas e campos">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          {CHIPS.map((c) => (
            <span key={c.t} className="chip" style={{ background: c.bg, color: c.cor }}>
              <span
                style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor' }}
                aria-hidden
              />
              {c.t}
            </span>
          ))}
          <span style={{ width: 1, height: 20, background: 'var(--line)' }} aria-hidden />
          {NOTAS.map((n) => (
            <span
              key={n.v}
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 30,
                height: 30,
                borderRadius: 'var(--r2)',
                background: n.bg,
                color: n.cor,
                fontFamily: 'var(--mono)',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {n.v}
            </span>
          ))}
          <span className="fld" style={{ width: 180, color: 'var(--dim)' }}>
            <Icon name="search" size={12} />
            buscar…
          </span>
          <span className="fld" style={{ fontFamily: 'var(--mono)' }}>
            04:12.40
          </span>
          <span className="fld">
            <Icon name="layout-template" size={12} style={{ color: M }} />
            Câmera + tela
            <Icon name="chevron-down" size={12} style={{ color: 'var(--dim)' }} />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: M }}>
            <kbd>J</kbd>
            <kbd>K</kbd>
            navegar
          </span>
        </div>
      </Secao>

      <Secao titulo="Avisos, vazio e carregamento">
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
          }}
        >
          {AVISOS.map((a) => (
            <div
              key={a.t}
              className="card"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 9,
                padding: '11px 12px',
                borderColor: a.borda,
              }}
            >
              <Icon name={a.n} size={14} style={{ color: a.cor }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{a.t}</span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: M,
                  }}
                >
                  {a.d}
                </span>
              </span>
              <button type="button" className="btn" style={{ height: 24, fontSize: 11 }}>
                {a.acao}
              </button>
            </div>
          ))}
          <div
            className="card"
            style={{ display: 'grid', placeItems: 'center', gap: 7, padding: 22, textAlign: 'center' }}
          >
            <Icon name="inbox" size={22} style={{ color: 'var(--dim)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Nenhuma live ainda</span>
            <span style={{ fontSize: 11.5, color: M, maxWidth: 220, lineHeight: 1.5 }}>
              Busque no canal ou cole uma URL para o app baixar e analisar a primeira live.
            </span>
            <button type="button" className="btn btn-pri" style={{ marginTop: 3 }}>
              <Icon name="radio" size={12} />
              Buscar lives
            </button>
          </div>
          <div
            className="card"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}
            aria-hidden
          >
            <span style={{ height: 11, width: '60%', borderRadius: 'var(--r1)', background: 'var(--inset)' }} />
            <span style={{ height: 74, borderRadius: 'var(--r2)', background: 'var(--inset)' }} />
            <span style={{ height: 9, width: '85%', borderRadius: 'var(--r1)', background: 'var(--inset)' }} />
            <span style={{ height: 9, width: '45%', borderRadius: 'var(--r1)', background: 'var(--inset)' }} />
          </div>
        </div>
      </Secao>

      <Secao titulo="Modais · abra para ver o padrão">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {BOTOES_MODAL.map((m) => (
            <button key={m.k} type="button" className="btn" onClick={() => setModal(m.k)}>
              <Icon name={m.n} size={13} />
              {m.t}
            </button>
          ))}
        </div>
      </Secao>

      <Secao titulo="Tipografia · Geist / Geist Mono">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>Título 16/700</span>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Card 13.5/700</span>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Rótulo 12.5/600</span>
          <span style={{ fontSize: 12, color: M }}>Corpo 12/400</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: M }}>Mono 11.5 · 04:12</span>
          <span className="lbl">Rótulo mono 9.5</span>
        </div>
      </Secao>

      <ModalDemo aberto={modal} fechar={() => setModal(null)} />
      <UpgradeToast
        open={toast && modal === null}
        onClose={() => setToast(false)}
        title="Short finalizado"
        detail="46s · 1080×1920 pronto para publicar"
      />
    </div>
  );
}
