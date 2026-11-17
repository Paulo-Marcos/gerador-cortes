import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

// D-1117 · Abas (Radix Tabs: setas, Home/End, `role=tab`). O traço da aba ATUAL é
// o feixe: "onde estou" é um dos poucos lugares em que ele aparece (DIRECAO §3.1).

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return <TabsPrimitive.List ref={ref} className={cn('flex gap-[22px] border-b border-fio', className)} {...props} />;
});

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'relative inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-0 bg-transparent p-0 text-corpo font-semibold text-fg-3 transition-colors duration-150',
        'hover:text-fg data-[state=active]:text-fg',
        'data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-sm data-[state=active]:after:bg-feixe data-[state=active]:after:content-[""]',
        'focus-visible:rounded-etiqueta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foco',
        'disabled:cursor-not-allowed disabled:text-fg-off',
        'motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'focus-visible:rounded-etiqueta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        className,
      )}
      {...props}
    />
  );
});
