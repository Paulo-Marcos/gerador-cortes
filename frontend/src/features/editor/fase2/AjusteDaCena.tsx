import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FOCO } from '@/features/editor/salaDoEditor';
import { cn } from '@/lib/utils';
import type { CenaRemotion } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import {
  camposQueMudaram,
  estadoDoCartao,
  motivoParaNaoAceitar,
  motivoParaNaoAjustar,
  NOME_DO_PROVEDOR,
  type PropostaDeAjuste,
} from './regrasDoAjuste';
import type { AjusteDoCorte } from './useAjusteDaCena';

// ─────────────────────────────────────────────────────────────────────────────
// AjusteDaCena (D-1074, RN-40) — no card da cena selecionada, "Pedir ajuste desta cena
// à IA": o operador diz o que mudar, sem gerar o plano de novo. A resposta é uma
// proposta, com o antes e o depois; só o Aceitar grava, e só esta cena. O estado do
// ajuste é do corte (um por vez), no painel; aqui o card só o mostra.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  ajuste: AjusteDoCorte;
  cena: CenaRemotion;
  /** Se o card é o da cena selecionada: o pedido só aparece nele. */
  ativa: boolean;
  /** O plano tem mudanças sem salvar: a IA lê o salvo, e aceitar recarrega o plano. */
  dirty: boolean;
  /** As cenas do plano estão sendo geradas: o ajuste e a geração não correm juntos. */
  emGeracao: boolean;
}

export function AjusteDaCena({ ajuste, cena, ativa, dirty, emGeracao }: Props) {
  const estado = estadoDoCartao({
    cena,
    ativa,
    alvo: ajuste.alvo,
    pedindo: ajuste.pedindo,
    temProposta: ajuste.proposta !== null,
  });
  if (estado === 'oculto') return null;
  return (
    <CartaoDoAjuste
      {...ajuste}
      proposta={estado === 'proposta' ? ajuste.proposta : null}
      pedindo={estado === 'pedindo'}
      bloqueio={motivoParaNaoAjustar({ dirty, emGeracao, outroAjusteEmVoo: ajuste.pedindo })}
      motivoParaNaoAceitar={motivoParaNaoAceitar(dirty)}
      pedir={(pedido) => ajuste.pedir(cena, pedido)}
    />
  );
}

export interface CartaoDoAjusteProps {
  proposta: PropostaDeAjuste | null;
  pedindo: boolean;
  cancelando: boolean;
  aceitando: boolean;
  bloqueio: string | null;
  motivoParaNaoAceitar: string | null;
  pedir: (pedido: string) => void;
  cancelar: () => void;
  aceitar: () => void;
  descartar: () => void;
}

/** O cartão em cada estado: o pedido, a IA trabalhando (com Cancelar) e a proposta. */
export function CartaoDoAjuste(props: CartaoDoAjusteProps) {
  if (props.proposta) return <PropostaDoAjuste {...props} proposta={props.proposta} />;
  if (props.pedindo) {
    return (
      <div className="mx-2.5 mb-2 flex items-center gap-2 rounded-ladrilho border border-fio bg-poco px-2 py-1.5 text-micro text-fg-2" role="status">
        <Icon name="loader-2" className="animate-spin" />
        <span className="flex-1">Pedindo o ajuste desta cena à IA…</span>
        <Button type="button" variant="secundario" size="pq" onClick={props.cancelar} disabled={props.cancelando}>
          {props.cancelando ? 'Cancelando…' : 'Cancelar'}
        </Button>
      </div>
    );
  }
  return <PedidoDoAjuste bloqueio={props.bloqueio} pedir={props.pedir} />;
}

function PedidoDoAjuste({ bloqueio, pedir }: { bloqueio: string | null; pedir: (pedido: string) => void }) {
  const [pedido, setPedido] = useState('');
  const vazio = pedido.trim() === '';
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!vazio && !bloqueio) pedir(pedido);
  };
  return (
    <form onSubmit={enviar} className="mx-2.5 mb-2 flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-micro text-fg-2">
        Pedir ajuste desta cena à IA
        <input
          type="text"
          value={pedido}
          maxLength={500}
          onChange={(e) => setPedido(e.target.value)}
          placeholder="ex.: encurte para caber em duas linhas"
          data-sala=""
          className={cn('h-8 rounded-campo border border-campo bg-poco px-2 text-corpo text-fg placeholder:text-fg-3', FOCO)}
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        {bloqueio && <span className="flex-1 text-micro text-fg-3">{bloqueio}</span>}
        <Button type="submit" variant="secundario" size="pq" disabled={vazio || Boolean(bloqueio)}>
          <Icon name="wand-sparkles" />
          Pedir ajuste
        </Button>
      </div>
    </form>
  );
}

function PropostaDoAjuste({
  proposta,
  aceitando,
  motivoParaNaoAceitar,
  aceitar,
  descartar,
}: CartaoDoAjusteProps & { proposta: PropostaDeAjuste }) {
  const mudancas = camposQueMudaram(proposta.antes, proposta.depois);
  return (
    <section
      aria-label="Proposta de ajuste da IA"
      className="mx-2.5 mb-2 flex flex-col gap-1.5 rounded-ladrilho border border-[color:var(--cc-info)] bg-[color-mix(in_srgb,var(--cc-info)_13%,transparent)] p-2 text-micro"
    >
      <strong className="font-semibold text-fg">Proposta do {NOME_DO_PROVEDOR[proposta.provider]}</strong>
      {mudancas.length === 0 ? (
        <p className="text-fg-2">A IA devolveu a cena sem mudanças.</p>
      ) : (
        <dl className="flex flex-col gap-1">
          {mudancas.map((m) => (
            <div key={m.campo}>
              <dt className="text-micro text-fg-3">{m.rotulo}</dt>
              <dd className="text-fg-2">
                <span className="sr-only">Antes: </span>
                <s>{m.antes}</s>
              </dd>
              <dd className="text-fg">
                <span className="sr-only">Depois: </span>
                {m.depois}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-micro text-fg-3">
        {motivoParaNaoAceitar ?? 'Aceitar troca só esta cena e desfaz a validação do plano.'}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="fantasma" size="pq" onClick={descartar} disabled={aceitando}>
          Descartar
        </Button>
        <Button type="button" variant="secundario" size="pq" onClick={aceitar} disabled={aceitando || Boolean(motivoParaNaoAceitar)}>
          {aceitando ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="circle-check" />}
          Aceitar
        </Button>
      </div>
    </section>
  );
}
