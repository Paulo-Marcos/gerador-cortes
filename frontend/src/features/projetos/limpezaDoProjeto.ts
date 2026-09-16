import type { Projeto } from '@/types/models';

// D-610: o que a live permite fazer com a mídia pesada, numa palavra.
//
// A regra é a do card antigo (D-457/D-598), trazida para cá para as duas
// Bibliotecas lerem o mesmo veredito:
//   · já limpa → nada a fazer (pode rebaixar o vídeo);
//   · baixando → nenhum selo: "pronto para limpar" ali convidaria a apagar o
//     vídeo que o pipeline ainda está gravando;
//   · com Fire pendente → a limpeza GUARDA bruto, shorts e vídeo desses cortes;
//   · sem Fire pendente → seguro limpar tudo.

export type LimpezaDoProjeto = {
  chave: 'limpo' | 'guardando' | 'pronto';
  texto: string;
  dica: string;
};

export function limpezaDoProjeto(
  projeto: Pick<Projeto, 'arquivos_limpos' | 'fires_pendentes' | 'status'>,
): LimpezaDoProjeto | null {
  if (projeto.arquivos_limpos) {
    return {
      chave: 'limpo',
      texto: 'mídia limpa',
      dica: 'Vídeos e áudios já saíram do disco. Textos e metadados ficaram.',
    };
  }
  if (projeto.status === 'baixando') return null;

  const pendentes = projeto.fires_pendentes;
  if (pendentes > 0) {
    const plural = pendentes === 1 ? '' : 's';
    return {
      chave: 'guardando',
      texto: `${pendentes} fire pendente${plural}`,
      dica: `${pendentes} Fire${plural} ainda precisa${pendentes === 1 ? '' : 'm'} de shorts: limpar agora guarda o bruto, os shorts e o vídeo deles.`,
    };
  }
  return {
    chave: 'pronto',
    texto: 'pronto para limpar',
    dica: 'Nenhum Fire aguardando shorts. É seguro limpar a mídia pesada.',
  };
}
