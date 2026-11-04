import { useEffect, useEffectEvent, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useToast } from '@/components/ui/toaster';
import { corteDaLive } from '@/upgrade/upgradeRoutes';
import { desfechoDaFalhaAoSalvar } from './editorEditState';

interface Opcoes {
  /** Há ajuste que só existe nesta tela. */
  sujo: boolean;
  /** Grava o ajuste; a promessa rejeita quando a gravação falha. */
  salvar: () => Promise<unknown>;
  /** Roda quando o ajuste foi gravado ou descartado, antes de a saída seguir. */
  aoResolver?: () => void;
  /** Frase do toast de sucesso, ex.: "Ajustes do corte salvos antes de sair." */
  avisoDeSucesso: string;
}

/**
 * D-746/D-1036: sair da tela com ajuste não salvo — trocar de corte (J/K, setas,
 * lista), seguir um link, voltar — perdia o ajuste em silêncio. A saída espera o
 * salvamento; se ele falhar, a tela fica e diz por quê. Fechar a aba não passa
 * pelo roteador: o navegador pergunta.
 *
 * Uma tela, um gancho: o roteador consulta só o último bloqueio registrado
 * ("only supports one blocker at a time"). Hoje a Pós monta um painel por vez
 * (abas); montar cenas e layout juntos deixaria o primeiro sem proteção.
 */
export function useSalvarAoSair({ sujo, salvar, aoResolver, avisoDeSucesso }: Opcoes) {
  const { notify } = useToast();
  // O painel pode sair do ar durante o salvamento (troca de aba); o roteador já
  // apagou o bloqueio e `proceed`/`reset` lançariam. O ajuste foi gravado.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  // Trocar de corte na Pós só muda a busca (`?corte=`); o caminho fica igual.
  const saida = useBlocker(
    ({ currentLocation, nextLocation }) =>
      sujo &&
      (currentLocation.pathname !== nextLocation.pathname ||
        corteDaLive(currentLocation.pathname, currentLocation.search) !==
          corteDaLive(nextLocation.pathname, nextLocation.search)),
  );
  // Só a mudança de estado do bloqueio dispara; o resto é lido na hora.
  const salvarAntesDeSair = useEffectEvent(() => {
    if (saida.state !== 'blocked') return;
    salvar().then(
      () => {
        aoResolver?.();
        notify(avisoDeSucesso, { tone: 'success' });
        if (montado.current) saida.proceed();
      },
      (erro) => {
        const desfecho = desfechoDaFalhaAoSalvar(erro);
        notify(desfecho.mensagem, { tone: desfecho.tom });
        if (!montado.current) return;
        if (!desfecho.sair) return saida.reset();
        aoResolver?.();
        saida.proceed();
      },
    );
  });
  useEffect(() => {
    salvarAntesDeSair();
  }, [saida.state]);

  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [sujo]);
}
