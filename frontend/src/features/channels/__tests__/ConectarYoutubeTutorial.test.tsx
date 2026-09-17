import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Canal, YoutubeAuthStatus } from '@/lib/channelsApi';
import { ChannelCard } from '../ChannelCard';
import { ConectarYoutubeTutorial } from '../ConectarYoutubeTutorial';

const DESTINO = 'C:\\App\\backend\\client_secrets.json';

const status = (trocas: Partial<YoutubeAuthStatus>): YoutubeAuthStatus => ({
  conectado: false,
  canal_titulo: '',
  cliente_configurado: false,
  client_secrets_destino: DESTINO,
  fluxo_em_andamento: false,
  erro: null,
  ...trocas,
});

const canal: Canal = {
  id: 'meu-canal',
  handle: '@meucanal',
  nome: 'Meu canal',
  credito: '',
  youtube_channel_id: '',
  paleta: { primaria: '#112233', secundaria: '#445566', acento: '#778899' },
  ativo: true,
};

function renderCard(youtube: YoutubeAuthStatus) {
  return renderToStaticMarkup(
    <ChannelCard
      canal={canal}
      selecionando={false}
      onSelecionar={() => {}}
      onEditar={() => {}}
      youtube={youtube}
    />,
  );
}

describe('ConectarYoutubeTutorial', () => {
  it('mostra o caminho exato de destino e o erro mais comum', () => {
    const html = renderToStaticMarkup(
      <ConectarYoutubeTutorial destino={DESTINO} abertoDeInicio onChecarDeNovo={() => {}} />,
    );
    expect(html).toContain(DESTINO);
    expect(html).toContain('access_denied');
    expect(html).toContain('<details open');
  });
});

describe('ChannelCard com o tutorial', () => {
  it('abre o tutorial quando falta o client_secrets.json', () => {
    expect(renderCard(status({}))).toContain('<details open');
  });

  it('deixa o tutorial recolhido quando o arquivo já existe', () => {
    const html = renderCard(status({ cliente_configurado: true }));
    expect(html).toContain('Como conectar o YouTube');
    expect(html).not.toContain('<details open');
  });

  it('some com o YouTube conectado', () => {
    const html = renderCard(status({ cliente_configurado: true, conectado: true }));
    expect(html).not.toContain('Como conectar o YouTube');
  });
});
