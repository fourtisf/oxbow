import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow="404" title="Nothing here">
          That page doesn&apos;t exist. Head back to the markets or create a pool.
        </PageHeader>
        <div className="cta" style={{ marginTop: 0 }}>
          <ButtonLink href="/explore">Explore markets</ButtonLink>
          <ButtonLink variant="glass" href="/create">
            Create a pool
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
