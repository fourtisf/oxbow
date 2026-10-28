import type { Metadata } from 'next';
import { Positions } from '@/components/dashboard/Positions';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <section className="view">
      <div className="wrap">
        <PageHeader eyebrow="Dashboard" title="Your positions">
          Pools you&apos;ve supplied liquidity to, what they&apos;re worth, and the fees waiting for you.
        </PageHeader>
        <Positions />
      </div>
    </section>
  );
}
