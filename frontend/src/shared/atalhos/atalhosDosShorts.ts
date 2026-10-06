import type { ShortcutSpec } from './shortcutsRegistry';

// A curadoria de shorts (D-476, D-581, D-584), fora de `shortcutsRegistry` para
// o registro caber no teto de tamanho de arquivo (D-771). Entra lá por spread,
// na mesma posição, e o detector de conflitos a vê como antes.

export const ATALHOS_DOS_SHORTS: readonly ShortcutSpec[] = [
  // D-476: espelham as teclas do Bruto de proposito. Quem cura shorts acabou de
  // sair do editor; trocar a tecla ali seria pedir para reaprender o que ja
  // esta na memoria muscular. O play/pause NAO entra aqui: espaco ja e
  // `player.togglePlay` no escopo global, e repeti-lo seria conflito real.
  {
    id: 'shorts.seekBack5s',
    screen: 'shorts',
    key: 'ArrowLeft',
    description: 'Retroceder 5 segundos',
    group: 'player',
  },
  {
    id: 'shorts.seekFwd5s',
    screen: 'shorts',
    key: 'ArrowRight',
    description: 'Avançar 5 segundos',
    group: 'player',
  },
  {
    id: 'shorts.speedDown',
    screen: 'shorts',
    key: 'j',
    mod: 'ctrl',
    description: 'Velocidade -0.25x',
    group: 'player',
  },
  {
    id: 'shorts.speedUp',
    screen: 'shorts',
    key: 'k',
    mod: 'ctrl',
    description: 'Velocidade +0.25x',
    group: 'player',
  },
  // D-581: o mesmo par que o Bruto ganhou na D-575, pela mesma razao e na
  // mesma tecla. Quem cura shorts acabou de sair do editor de bruto — afinar a
  // borda de um trecho pede ouvir devagar, conferir pede 1x, e com Ctrl+J/K
  // cada ida e volta custava varias teclas.
  {
    id: 'shorts.alternarVelocidade',
    screen: 'shorts',
    key: 'u',
    mod: 'ctrl',
    description: 'Alternar 1x <-> velocidade de trabalho',
    group: 'player',
  },
  // D-581: desfazer/refazer a curadoria. Mesmas teclas do Bruto — as duas
  // telas nunca coexistem, e trocar a tecla seria pedir para reaprender o que
  // ja esta na memoria muscular.
  {
    id: 'shorts.undo',
    screen: 'shorts',
    key: 'z',
    mod: 'ctrl',
    description: 'Desfazer a ultima gravacao (bordas, gancho, palco, decisao)',
    group: 'edicao',
    skipInEditable: true,
  },
  {
    id: 'shorts.redo',
    screen: 'shorts',
    key: 'y',
    mod: 'ctrl',
    description: 'Refazer a gravacao desfeita',
    group: 'edicao',
    skipInEditable: true,
  },
  // D-584: Ctrl+S CONFIRMA, porque nesta tela nao ha o que salvar.
  //
  // Toda mudanca aqui ja e um PATCH imediato (e tem de ser: a previa do palco
  // le o estado GRAVADO). Mas a mao vai no Ctrl+S sozinha, e um atalho que nao
  // existe nao e "nada acontece" — no navegador ele abre o "salvar pagina".
  // Capturar a tecla e responder "tudo salvo" e o unico desfecho honesto: diz a
  // verdade e tira o dialogo do Chrome do caminho.
  {
    id: 'shorts.salvar',
    screen: 'shorts',
    key: 's',
    mod: 'any',
    description: 'Confirmar que esta tudo salvo (aqui a gravacao e automatica)',
    group: 'global',
  },
];
