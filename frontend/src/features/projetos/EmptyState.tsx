import { FolderPlus, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onCreate: () => void;
  onExplorar: () => void;
}

export function EmptyState({ onCreate, onExplorar }: Props) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-5 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-surface-1/50 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-600/15 text-accent-300">
        <FolderPlus size={28} aria-hidden />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h2 className="text-xl font-semibold text-text-100">Nenhum projeto ainda</h2>
        <p className="text-sm text-text-300">
          Comece colando a URL de uma live do YouTube ou explore lives recentes do seu canal.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onCreate}>
          <FolderPlus size={16} />
          Criar primeiro projeto
        </Button>
        <Button variant="outline" onClick={onExplorar}>
          <Youtube size={16} />
          Explorar YouTube
        </Button>
      </div>
    </div>
  );
}
