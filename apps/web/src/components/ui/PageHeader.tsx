import type { ReactNode } from 'react';

/** Page intro block (`.page-h`) used by Explore, Create, Dashboard and Docs. */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <header className="page-h">
      <div className="eyebrow">
        <span className="live" aria-hidden="true" />
        {eyebrow}
      </div>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}
