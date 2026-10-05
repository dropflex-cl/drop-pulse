"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// El informe de la estrategia tal como lo escribió el mega prompt (markdown con tablas). Se dibuja con
// los tokens de DropFlex; los emojis del informe son contenido de la IA y se muestran tal cual.

const components: Components = {
  h1: ({ children }) => <h3 className="mt-6 text-heading first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-6 text-heading first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 text-row font-semibold">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-3 text-small font-semibold">{children}</h5>,
  p: ({ children }) => <p className="mt-2 text-small">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-small">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-small">{children}</ol>,
  strong: ({ children }) => <b className="font-semibold">{children}</b>,
  hr: () => <hr className="my-4 border-border" />,
  blockquote: ({ children }) => <blockquote className="mt-2 border-l-2 border-muted-foreground pl-3 text-small">{children}</blockquote>,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-label font-normal">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b bg-muted px-2.5 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b px-2.5 py-1.5 align-top tabular-nums">{children}</td>,
  // Un enlace del informe no lleva a ninguna parte de la app: se muestra como texto.
  a: ({ children }) => <span>{children}</span>,
  code: ({ children }) => <code className="rounded-sm bg-muted px-1 font-mono text-label">{children}</code>,
};

export function StrategyReport({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("min-w-0 break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
