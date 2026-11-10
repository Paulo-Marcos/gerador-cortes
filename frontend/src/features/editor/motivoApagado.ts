// D-993: por que o operador apagou um corte que a IA propôs.
//
// Cópia de `MOTIVOS_APAGADO` em `backend/app/domain/corte/motivo_apagado.py`,
// porque os projetos não compartilham módulo. `motivoApagado.test.ts` LÊ aquele
// arquivo e compara: se um lado mudar sozinho, o teste cai em vez de a tela
// oferecer um motivo que o backend descarta.
//
// D-1006: a lista passou a ser de cada canal (`useMotivosVisiveis`, tela de
// Canais); esta é o padrão de quem nunca a editou, e o que o aviso do riscado
// mostra enquanto a do canal não chega.

import type { OpcaoConfirmacao } from '@/components/ui/confirm-dialog';

export const MOTIVOS_APAGADO: readonly OpcaoConfirmacao[] = [
  { slug: 'tema_fraco', rotulo: 'Tema não rende' },
  { slug: 'repetido', rotulo: 'Repete outro corte' },
  { slug: 'sem_contexto', rotulo: 'Não se sustenta sozinho' },
  { slug: 'fora_da_linha', rotulo: 'Fora da linha do canal' },
  { slug: 'curto_demais', rotulo: 'Curto demais' },
  { slug: 'problema_tecnico', rotulo: 'Áudio ou vídeo com problema' },
];
