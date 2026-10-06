import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AvaliacaoCorteModal } from '@/features/editor/avaliacao/AvaliacaoCorteModal';
import type { Corte } from '@/types/models';
import { COR_DO_SELO } from '@/upgrade/SeloDeEstado';
import { ModalText, UpgradeModal } from '@/upgrade/UpgradeModal';
import { NOTA_MAXIMA, lerNotaDoCorte, type NotaDoCorte } from './notaDoCorte';

// ─────────────────────────────────────────────────────────────────
// D-886 · "Por que este corte?"
//
// O operador assiste um corte, acha fraco e quer saber o que a IA viu nele.
// A resposta já estava gravada desde a análise — a `justificativa` (I-034) e
// o `score` (D-302) —, mas só a auditoria da análise inteira a mostrava.
// Aqui ela vem do corte, em quatro blocos curtos: a nota, o porquê, o gancho
// e o tema. O rodapé leva à nota do operador (D-419), que é a outra metade
// da comparação: o quão longe a IA está do que ele acha bom.
// ─────────────────────────────────────────────────────────────────

export function PorQueDoCorteModal({ corte, aoFechar }: { corte: Corte; aoFechar: () => void }) {
  const [avaliando, setAvaliando] = useState(false);
  const nota = lerNotaDoCorte(corte.score);
  // Portal para a `.ap`: o vidro (`backdrop-filter`) da linha e da barra vira
  // a referência do `position: fixed` e prenderia o modal dentro delas.
  const alvo = document.querySelector('.ap') ?? document.body;
  if (avaliando) {
    return createPortal(
      <AvaliacaoCorteModal
        open
        corteId={corte.id}
        tituloCorte={corte.titulo_proposto}
        descricao="A sua nota, ao lado da que a IA deu"
        onClose={aoFechar}
      />,
      alvo,
    );
  }
  return createPortal(
    <UpgradeModal
      open
      onClose={aoFechar}
      icon="sparkles"
      title={`Por que a IA escolheu o corte #${corte.numero}`}
      subtitle={corte.titulo_proposto}
      secondaryLabel="Fechar"
      primaryLabel="Dar a minha nota"
      primaryIcon="star"
      primaryStrong={false}
      onPrimary={() => setAvaliando(true)}
    >
      <ConteudoDoPorQue corte={corte} nota={nota} />
    </UpgradeModal>,
    alvo,
  );
}

export function ConteudoDoPorQue({ corte, nota }: { corte: Corte; nota: NotaDoCorte | null }) {
  const gancho = corte.frase_gancho_texto?.trim();
  if (!nota && !corte.justificativa?.trim() && !gancho) {
    return (
      <ModalText>
        A IA não deixou justificativa nem nota para este corte — ele foi criado à mão ou veio de
        uma análise anterior a esses campos.
      </ModalText>
    );
  }
  return (
    <>
      {nota ? <BlocoDaNota nota={nota} /> : null}
      {corte.justificativa?.trim() ? (
        <Bloco titulo="Por que virou corte">{corte.justificativa}</Bloco>
      ) : null}
      {gancho ? (
        <Bloco titulo={`Frase-gancho${corte.frase_gancho_hms ? ` · ${corte.frase_gancho_hms}` : ''}`}>
          “{gancho}”
        </Bloco>
      ) : null}
      {corte.tema_central?.trim() ? <Bloco titulo="Tema">{corte.tema_central}</Bloco> : null}
    </>
  );
}

function BlocoDaNota({ nota }: { nota: NotaDoCorte }) {
  const { cor } = COR_DO_SELO[nota.tom];
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: cor }}>
          {nota.total}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mute)' }}>
          de {NOTA_MAXIMA} · nota da IA
        </span>
      </span>
      {nota.partes.map((p) => (
        <span
          key={p.rotulo}
          title={p.pergunta}
          style={{ display: 'grid', gridTemplateColumns: '56px 1fr 22px', gap: 8, alignItems: 'center' }}
        >
          <span style={{ fontSize: 12, color: 'var(--mute)' }}>{p.rotulo}</span>
          <span style={{ height: 6, borderRadius: 99, background: 'var(--inset)', overflow: 'hidden' }}>
            <span
              style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.max(0, p.valor * 10))}%`, background: cor }}
            />
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right' }}>{p.valor}</span>
        </span>
      ))}
      <span style={{ fontSize: 11, color: 'var(--dim)' }}>
        Ranking entre os cortes desta live, não nota absoluta de qualidade.
      </span>
    </section>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mute)' }}>{titulo}</span>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>{children}</p>
    </section>
  );
}
