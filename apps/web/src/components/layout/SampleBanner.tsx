import { getT } from '@/i18n/server';
import { SAMPLE_DATA } from '@/lib/api/mode';
import { networkLabel } from '@/lib/env';
import { WarnIcon } from '../ui/Icons';

/** Strip above the ticker while the app runs on sample data, so the demo is never mistaken for live markets. */
export function SampleBanner() {
  if (!SAMPLE_DATA) return null;
  const t = getT();
  return (
    <div className="samplebar" role="note">
      <WarnIcon />
      <span>{t.common.sampleBanner(networkLabel)}</span>
    </div>
  );
}
