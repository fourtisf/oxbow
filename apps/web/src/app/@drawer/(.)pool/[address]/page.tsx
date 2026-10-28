import { PoolDrawer } from '@/components/pool/PoolDrawer';

/** In-app navigation to /pool/[address] opens the drawer over the current page. */
export default function PoolDrawerRoute({ params, searchParams }: { params: { address: string }; searchParams: { tab?: string } }) {
  return <PoolDrawer key={params.address} address={params.address} tab={searchParams.tab === 'add' ? 'add' : 'swap'} />;
}
