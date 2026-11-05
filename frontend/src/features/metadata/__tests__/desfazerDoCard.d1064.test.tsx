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

// D-1064: o Desfazer no card. S1: o blur e o clique saem juntos, e o texto do blur ficava na
// tela por cima do que o Desfazer gravou. E quando a versão sai: Desfazer, Manter, segundo Regerar.

vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/features/ia', async () => (await import('./desfazerDoCard.apoio')).geracaoFalsa);
vi.mock('../api/metadados', async () => ({
  metadadosApi: (await import('./desfazerDoCard.apoio')).metadadosApiFalsa,
}));

const { useMetadataCard } = await import('../useMetadataCard');
prepararCadaTeste(useMetadataCard);

describe('S1: digitar depois do Regerar e clicar direto em Desfazer', () => {
  async function regerarEDigitar() {
    await abrirCard();
    await clicarNaIa();
    await iaTermina();
    expect(card).toMatchObject(TELA_DA_IA);
    await digitarTitulo('Y');
  }

  it('a releitura do blur cancelada pelo Desfazer: a tela fica com a versão, e o próximo blur não grava', async () => {
    await regerarEDigitar();
    h.prenderProximaLeitura = true;
    await sairDoTitulo();
    expect(h.soltarLeitura).not.toBeNull();

    await clicarEmDesfazer();

    expect(card).toMatchObject(TELA_GRAVADA);
    expect(h.servidor.c1).toMatchObject(GRAVADO);
    await sairDoTitulo();
    expect(salvosEm('c1')).toEqual([{ titulo_youtube: 'Y' }, GRAVADO]);
  });

  it('a leitura cancelada que responde tarde não traz o rascunho de volta', async () => {
    await regerarEDigitar();
    h.prenderProximaLeitura = true;
    await sairDoTitulo();
    await clicarEmDesfazer();

    h.soltarLeitura?.();
    await assentar();

    expect(card).toMatchObject(TELA_GRAVADA);
  });

  it('o salvar do blur falhou: o Desfazer leva a tela do mesmo jeito', async () => {
    await regerarEDigitar();
    h.falharProximoSalvo = true;
    await sairDoTitulo();
    expect(card.title).toBe('Y');

    await clicarEmDesfazer();

    expect(card).toMatchObject(TELA_GRAVADA);
    expect(h.servidor.c1).toMatchObject(GRAVADO);
    await sairDoTitulo();
    expect(salvosEm('c1')).toEqual([GRAVADO]);
  });

  it('com a releitura no meio, também termina na versão', async () => {
    await regerarEDigitar();
    await sairDoTitulo();
    expect(card.meta?.titulo_youtube).toBe('Y');

    await clicarEmDesfazer();

    expect(card).toMatchObject(TELA_GRAVADA);
    expect(h.servidor.c1).toMatchObject(GRAVADO);
  });

  it('o Desfazer não apaga a oferta de outro corte nem grava sem versão', async () => {
    await abrirCard();
    await trocarDeCorte('c2');
    await digitarTitulo('rascunho de c2');

    card.desfazerGeracao();
    await assentar();

    expect(card.title).toBe('rascunho de c2');
    expect(h.salvos).toEqual([]);
  });
});

describe('quando a versão sai', () => {
  async function regerarAte(gerado: object) {
    h.regerar.mockImplementation(iaEmEspera('c1', gerado));
    await clicarNaIa();
    await iaTermina();
  }

  it('Desfazer: sai, e não volta ao reabrir nem ao trocar de corte', async () => {
    await abrirCard();
    await regerarAte(DA_IA);

    await clicarEmDesfazer();
    expect(card.desfazerIa).toBeNull();

    await fecharModal();
    await abrirModal();
    expect(card.desfazerIa).toBeNull();

    await trocarDeCorte('c2');
    await trocarDeCorte('c1');
    expect(card.desfazerIa).toBeNull();
  });

  it('Manter: sai, fica o texto da IA, e não volta ao reabrir nem ao trocar de corte', async () => {
    await abrirCard();
    await regerarAte(DA_IA);

    await clicarEmManter();
    expect(card.desfazerIa).toBeNull();
    expect(card).toMatchObject(TELA_DA_IA);
    expect(h.salvos).toEqual([]);

    await fecharModal();
    await abrirModal();
    expect(card.desfazerIa).toBeNull();

    await trocarDeCorte('c2');
    await trocarDeCorte('c1');
    expect(card.desfazerIa).toBeNull();
  });

  it('segundo Regerar: a versão nova é o texto que ele reescreveu, um nível só', async () => {
    const SEGUNDA = { ...DA_IA, titulo_youtube: 'Segunda da IA' };
    await abrirCard();
    await regerarAte(DA_IA);

    await regerarAte(SEGUNDA);

    expect(card.title).toBe('Segunda da IA');
    expect(card.desfazerIa).toEqual(DA_IA);
  });

  it('segundo Regerar que falha: a oferta anterior continua valendo', async () => {
    await abrirCard();
    await regerarAte(DA_IA);

    h.regerar.mockImplementation(async () => {
      throw new Error('a IA caiu');
    });
    await clicarNaIa();

    expect(card.desfazerIa).toEqual(GRAVADO);
    expect(card).toMatchObject(TELA_DA_IA);
  });

  it('Desfazer durante o segundo Regerar: o que ele gravou é o que a IA reescreve, e volta', async () => {
    const SEGUNDA = { ...DA_IA, titulo_youtube: 'Segunda da IA' };
    await abrirCard();
    await regerarAte(DA_IA);
    h.regerar.mockImplementation(iaEmEspera('c1', SEGUNDA));
    await clicarNaIa();

    await clicarEmDesfazer();
    await iaTermina();

    expect(card.title).toBe('Segunda da IA');
    expect(card.desfazerIa).toEqual(GRAVADO);
  });

  it('Regerar num corte não mexe na oferta do outro', async () => {
    await abrirCard();
    await regerarAte(DA_IA);

    await trocarDeCorte('c2');
    h.regerar.mockImplementation(iaEmEspera('c2', DA_IA));
    await clicarNaIa();
    await iaTermina();
    expect(card.desfazerIa).toEqual(DO_OUTRO_CORTE);

    await trocarDeCorte('c1');
    expect(card.desfazerIa).toEqual(GRAVADO);
  });
});
