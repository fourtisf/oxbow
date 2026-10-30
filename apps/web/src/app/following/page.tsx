import type { Metadata } from 'next';
import { FollowingView } from '@/components/following/FollowingView';
import { PageHeader } from '@/components/ui/PageHeader';
import { getT } from '@/i18n/server';

export function generateMetadata(): Metadata {
  const t = getT();
  return { title: t.meta.following, robots: { index: false } };
}

export default function FollowingPage() {
  const t = getT();
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow={t.following.eyebrow} title={t.following.title}>
          {t.following.lede}
        </PageHeader>
        <FollowingView />
      </div>
    </section>
  );
}
