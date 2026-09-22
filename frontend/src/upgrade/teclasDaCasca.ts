// ─────────────────────────────────────────────────────────────────
// D-599 · O que uma tecla significa para a casca.
//
// A casca responde a ⌘B, ⌘K, ⌘J, J, K e Enter. As três últimas são teclas
// comuns — as mesmas que a pessoa usa para digitar e para apertar
// botões —, então a pergunta difícil não é "o que J faz", e sim "quando
// J é da casca e quando é de outra pessoa".
//
// A decisão mora aqui, sem DOM, para poder ser testada caso a caso: um
// Enter que aprova um corte no momento errado custa uma decisão
// editorial, e esse tipo de erro não se descobre olhando a tela.
//
// RODADA 2 · duas correções:
//
//   1. Com diálogo aberto, o teclado é DELE — inclusive ⌘K. Antes o
//      modificador passava antes da trava de overlay: ⌘K abria a paleta
//      por cima de um formulário e o Esc seguinte fechava os dois.
//   2. A trava do Enter olhava para QUALQUER controle focado. Como o
//      navegador deixa o foco no botão clicado, bastava clicar um corte
//      na lista para o Enter morrer — com o ↵ ainda impresso na barra.
//      Agora só travam os controles de DECISÃO (`data-decisao`), que são
//      justamente os que o Enter duplicaria.
// ─────────────────────────────────────────────────────────────────

export type AcaoDaCasca = 'trilho' | 'busca' | 'fila' | 'proximo' | 'anterior' | 'primario';

export type Contexto = {
  tecla: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  /** Foco num campo de texto, select ou área editável. */
  digitando: boolean;
  /** Foco num controle que TAMBÉM decide — botão da barra de ações,
   *  veredito, qualquer coisa marcada com `data-decisao`. */
  focoEmDecisao: boolean;
  /** Diálogo, menu ou popover aberto. */
  overlayAberto: boolean;
  /** Algum handler anterior já tratou o evento. */
  jaTratado: boolean;
  /** A barra tem primário ligado a uma ação e não desabilitado. */
  primarioDisponivel: boolean;
};

export function acaoDaTecla(c: Contexto): AcaoDaCasca | null {
  // Diálogo, menu ou popover aberto: nenhuma tecla é da casca. Vale também
  // para ⌘K — abrir a busca por cima de um formulário meio preenchido é
  // oferecer duas saídas e cumprir a errada no Esc.
  if (c.overlayAberto || c.jaTratado) return null;

  const comando = c.meta || c.ctrl;
  const tecla = c.tecla.toLowerCase();

  // ⌘B e ⌘K valem até digitando: o modificador já diz que não é texto.
  if (comando && tecla === 'b') return 'trilho';
  if (comando && tecla === 'k') return 'busca';
  // D-746: ⌘J abre a gaveta da fila. Fechar é da própria gaveta — aberta,
  // ela é um diálogo, e com diálogo na tela nada daqui responde.
  if (comando && tecla === 'j') return 'fila';

  // Daqui para baixo são teclas sem modificador. Elas pertencem a quem
  // estiver escrevendo — nunca à casca.
  if (c.digitando || c.meta || c.ctrl || c.alt) return null;

  if (tecla === 'j') return 'proximo';
  if (tecla === 'k') return 'anterior';

  if (tecla === 'enter') {
    // Com o foco num controle de decisão, o navegador JÁ vai clicar nele.
    // Disparar o primário também seria ação dupla: foco em "Rejeitar" +
    // Enter rejeitaria e aprovaria o mesmo corte num toque.
    if (c.focoEmDecisao || !c.primarioDisponivel) return null;
    return 'primario';
  }

  return null;
}
