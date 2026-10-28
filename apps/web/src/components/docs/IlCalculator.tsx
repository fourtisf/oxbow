'use client';

import { useState, type CSSProperties } from 'react';
import { impermanentLossPct, pct, signed } from '@oxbow/shared';
import { useT } from '@/i18n/client';

const MIN = -90;
const MAX = 400;

/** Impermanent loss for a price move of the pool's token against its pair asset. */
export function IlCalculator() {
  const t = useT();
  const [move, setMove] = useState(100);
  const il = impermanentLossPct(1 + move / 100);
  return (
    <div className="ilcalc">
      <div className="label">{t.docs.ilCalc}</div>
      <label htmlFor="ilMove">
        <span>{t.docs.ilMove}</span>
        <b>{signed(move)}</b>
      </label>
      <input
        className="range"
        id="ilMove"
        type="range"
        min={MIN}
        max={MAX}
        step={5}
        value={move}
        aria-label={t.docs.ilAria}
        style={{ '--p': ((move - MIN) / (MAX - MIN)) * 100 + '%' } as CSSProperties}
        onChange={(e) => setMove(+e.target.value)}
      />
      <div className="readouts">
        <div>
          <span>{t.docs.ilVsHold}</span>
          <strong className={il < 0 ? 'down' : undefined}>{il === 0 ? '0.00%' : signed(il)}</strong>
        </div>
        <div>
          <span>{t.docs.ilFeesNeeded}</span>
          <strong>{pct(-il)}</strong>
        </div>
      </div>
    </div>
  );
}
