import { describe, expect, it, vi } from 'vitest';
import { assentar } from '../../editor/__tests__/domMinimo';
import {
  card,
  h,
  GRAVADO,
  DA_IA,
  DO_OUTRO_CORTE,
  TELA_GRAVADA,
  TELA_DA_IA,
  abrirCard,
  clicarNaIa,
  iaTermina,
  digitarTitulo,
  sairDoTitulo,
  clicarEmDesfazer,
  clicarEmManter,
  fecharModal,
  abrirModal,
  trocarDeCorte,
  salvosEm,
  iaEmEspera,
  prepararCadaTeste,
} from './desfazerDoCard.apoio';

// D-1064, S2: quem sai da tela durante o Regerar perdia a versão anterior. Trocar de corte
// recria o card (`UmaTelaPorCorte`, D-1033) e fechar o modal o desmonta, enquanto a geração segue.

vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/features/ia', async () => (await import('./desfazerDoCard.apoio')).geracaoFalsa);
vi.mock('../api/metadados', async () => ({
  metadadosApi: (await import('./desfazerDoCard.apoio')).metadadosApiFalsa,
}));

const { useMetadataCard } = await import('../useMetadataCard');
prepararCadaTeste(useMetadataCard);

describe('S2: trocar de corte durante o Regerar', () => {
  it('termina de volta no corte: a IA entra e a versão anterior fica no Desfazer', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);
  });

  it('o rascunho digitado na volta é substituído, e volta no Desfazer', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');
    await digitarTitulo('digitado na volta');

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'digitado na volta' });

    await clicarEmDesfazer();

    expect(card.title).toBe('digitado na volta');
    expect(h.servidor.c1).toMatchObject({ titulo_youtube: 'digitado na volta' });
  });

  it('o salvo antes de sair continua na versão', async () => {
    await abrirCard();
    await clicarNaIa();
    await digitarTitulo('salvo em c1');
    await sairDoTitulo();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');

    await iaTermina();

    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'salvo em c1' });
  });

  it('o salvo depois de voltar também entra na versão', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await trocarDeCorte('c1');
    await digitarTitulo('salvo na volta');
    await sairDoTitulo();

    await iaTermina();

    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'salvo na volta' });
  });

  it('termina no outro corte: a versão espera a volta, e o outro corte não a vê', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');

    await iaTermina();

    expect(card.desfazerIa).toBeNull();
    expect(card.title).toBe('Título de c2');

    await trocarDeCorte('c1');

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);

    await clicarEmDesfazer();

    expect(h.servidor.c1).toMatchObject(GRAVADO);
    expect(h.servidor.c2).toEqual(DO_OUTRO_CORTE);
    expect(card).toMatchObject(TELA_GRAVADA);
  });

  it('termina no outro corte: o rascunho de lá fica, e o Desfazer não grava nele', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await digitarTitulo('rascunho de c2');

    await iaTermina();

    expect(card.title).toBe('rascunho de c2');
    card.desfazerGeracao();
    await assentar();
    expect(salvosEm('c2')).toEqual([]);
  });

  it('termina no outro corte: quem é relido é o corte da geração', async () => {
    await abrirCard(60_000);
    await clicarNaIa();
    await trocarDeCorte('c2');

    await iaTermina();
    await trocarDeCorte('c1');

    expect(card).toMatchObject(TELA_DA_IA);
  });

  it('o que se salva no outro corte durante a geração não entra na versão', async () => {
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');
    await digitarTitulo('texto de c2');
    await sairDoTitulo();
    await trocarDeCorte('c1');

    await iaTermina();

    expect(card.desfazerIa).toEqual(GRAVADO);
    await clicarEmDesfazer();
    expect(h.servidor.c1).toMatchObject(GRAVADO);
    expect(h.servidor.c2).toMatchObject({ titulo_youtube: 'texto de c2' });
  });

  it('a oferta não se apaga ao sair: volta quando o operador volta ao corte', async () => {
    await abrirCard();
    await clicarNaIa();
    await iaTermina();
    expect(card.desfazerIa).toEqual(GRAVADO);

    await trocarDeCorte('c2');
    expect(card.desfazerIa).toBeNull();

    await trocarDeCorte('c1');
    expect(card.desfazerIa).toEqual(GRAVADO);
  });

  it('o Completar de um corte, terminando noutro, não apaga a oferta de lá', async () => {
    h.servidor.c1 = { ...GRAVADO, descricao_youtube: '' };
    h.regerar.mockImplementation(iaEmEspera('c2', DA_IA));
    h.gerar.mockImplementation(iaEmEspera('c1', DA_IA));
    await abrirCard();
    await trocarDeCorte('c2');
    await clicarNaIa();
    await iaTermina();
    expect(card.desfazerIa).toEqual(DO_OUTRO_CORTE);

    await trocarDeCorte('c1');
    await clicarNaIa();
    await trocarDeCorte('c2');
    await iaTermina();

    expect(card.desfazerIa).toEqual(DO_OUTRO_CORTE);
  });

  it('a geração que falha longe do corte não oferece Desfazer na volta', async () => {
    let cair: (erro: Error) => void = () => undefined;
    h.regerar.mockImplementation(
      () =>
        new Promise((_, rejeitar) => {
          cair = rejeitar;
        }),
    );
    await abrirCard();
    await clicarNaIa();
    await trocarDeCorte('c2');

    cair(new Error('a IA caiu'));
    await assentar();
    await trocarDeCorte('c1');

    expect(card.desfazerIa).toBeNull();
    expect(card).toMatchObject(TELA_GRAVADA);
  });
});

describe('o mesmo card trocando de corte, sem a tela recriar', () => {
  it('a geração termina na gaveta do corte que a pediu, e é ele quem é relido', async () => {
    await abrirCard(60_000, false);
    await clicarNaIa();
    await trocarDeCorte('c2');
    await digitarTitulo('rascunho de c2');

    await iaTermina();

    expect(card.title).toBe('rascunho de c2');
    expect(card.desfazerIa).toBeNull();

    await trocarDeCorte('c1');

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);
  });
});

describe('S2: fechar o modal durante o Regerar', () => {
  it('a IA termina com o modal fechado: ao reabrir, o Desfazer está lá', async () => {
    await abrirCard();
    await clicarNaIa();
    await fecharModal();

    await iaTermina();
    await abrirModal();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual(GRAVADO);

    await clicarEmDesfazer();

    expect(h.servidor.c1).toMatchObject(GRAVADO);
    expect(card).toMatchObject(TELA_GRAVADA);
  });

  it('reabre antes de terminar: o rascunho é substituído, e o Desfazer chega sozinho', async () => {
    await abrirCard();
    await clicarNaIa();
    await fecharModal();
    await abrirModal();
    await digitarTitulo('digitado ao reabrir');

    await iaTermina();

    expect(card).toMatchObject(TELA_DA_IA);
    expect(card.desfazerIa).toEqual({ ...GRAVADO, titulo_youtube: 'digitado ao reabrir' });
  });

  it('o card que nasceu antes da oferta também a dispensa com Manter', async () => {
    await abrirCard();
    await clicarNaIa();
    await fecharModal();
    await abrirModal();
    await iaTermina();
    expect(card.desfazerIa).toEqual(GRAVADO);

    await clicarEmManter();

    expect(card.desfazerIa).toBeNull();
  });

  it('a oferta ainda sem resposta continua ao fechar e reabrir', async () => {
    await abrirCard();
    await clicarNaIa();
    await iaTermina();

    await fecharModal();
    await abrirModal();

    expect(card.desfazerIa).toEqual(GRAVADO);
  });
});
