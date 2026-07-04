import { ExternalLink } from 'lucide-react';

interface Props {
  titulo: string;
}

export function StubPage({ titulo }: Props) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-text-100">{titulo}</h1>
      <p className="max-w-md text-sm text-text-300">
        Esta página ainda não foi migrada para a v2. Continua disponível no frontend Angular legado.
      </p>
      <a
        href="http://localhost:4200"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-sm text-text-200 hover:border-[var(--border-hover)] hover:text-text-100"
      >
        Abrir no Angular (porta 4200)
        <ExternalLink size={14} aria-hidden />
      </a>
    </div>
  );
}
