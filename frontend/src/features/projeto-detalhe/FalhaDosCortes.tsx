import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { EstadoVazio } from '@/components/ui/estado-vazio';

/**
 * D-1032: a API de cortes falhou. Diz isso e oferece tentar de novo — nunca o
 * "Analisar com a IA" da live vazia, que soma cortes aos existentes e gasta IA.
 * D-1149: o estado de erro da Sala escura.
 */
export function FalhaDosCortes({
  mensagem,
  tentarDeNovo,
}: {
  mensagem: string;
  tentarDeNovo: () => void;
}) {
  return <EstadoDeErro titulo="Não consegui carregar os cortes desta live" motivo={mensagem} aoTentar={tentarDeNovo} />;
}

/**
 * Live sem cortes (ou busca/filtro que escondeu todos): diz por quê. D-1149: a ação é
 * secundária — a primária da tela é a da barra de ação, que nesse caso também analisa (§5).
 */
export function ListaVazia({
  texto,
  ofereceAnalise,
  analisar,
}: {
  texto: string;
  ofereceAnalise: boolean;
  analisar: () => void;
}) {
  return (
    <EstadoVazio
      icone="inbox"
      titulo={texto}
      acao={ofereceAnalise ? 'Analisar com a IA' : undefined}
      aoAgir={ofereceAnalise ? analisar : undefined}
    />
  );
}
