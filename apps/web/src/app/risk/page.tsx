import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { getT } from '@/i18n/server';

export function generateMetadata(): Metadata {
  return { title: getT().meta.risk };
}

export default function RiskPage() {
  const t = getT();
  return (
    <LegalPage
      eyebrow={t.footer.legal}
      title={t.meta.risk}
      lede="Trading tokens and providing liquidity can lose you all of your money. These are the main risks."
      sections={[
        {
          h: 'Memecoins are extremely volatile',
          body: ['Most memecoins have no underlying value and can fall to zero in minutes. Prices on new pools are set by a handful of trades and can move by hundreds of percent.'],
        },
        {
          h: 'Rug pulls and unlocked liquidity',
          body: [
            'If a pool’s liquidity is unlocked, its creator can withdraw it at any time, leaving buyers unable to sell. Check the liquidity label and the "Who holds the liquidity" breakdown before you buy. Locks end on their unlock date.',
          ],
        },
        {
          h: 'Token authorities and extensions',
          body: [
            'A token with a mint authority can be inflated. One with a freeze authority can have holders’ balances frozen. Token-2022 extensions such as transfer hooks, transfer fees and permanent delegates can block, tax or move transfers. Oxbow flags these, but checks can miss things.',
          ],
        },
        {
          h: 'Stock tokens',
          body: [
            'Stock tokens depend on their issuer and the custody of the underlying shares. They are not shares and usually carry no voting rights. They may be restricted where you live.',
            'The stock market closes at night, on weekends and on holidays, while pools keep trading. Price feeds stop moving and pool prices can drift and then jump at the open. Splits, dividends and trading halts are handled by the issuer and can affect prices.',
          ],
        },
        {
          h: 'Impermanent loss',
          body: [
            <>
              Liquidity providers end up with less than if they had held both tokens when prices drift apart. Fees may or may not make up for it. See{' '}
              <Link href="/docs#d-risks">What liquidity providers risk</Link>.
            </>,
          ],
        },
        {
          h: 'Slippage, front-running and failed transactions',
          body: [
            'Large trades in small pools move the price a lot. Bots can trade ahead of you. Set a slippage limit you are comfortable with; transactions can fail and still cost network fees.',
          ],
        },
        {
          h: 'Smart contracts and third parties',
          body: [
            'Pools run on third-party protocols, locks on third-party lock programs, and swaps may route through aggregators. Bugs, exploits, outages or changes in any of them can cause losses. There is no insurance.',
          ],
        },
        {
          h: 'Data can be wrong',
          body: ['Prices, volumes, labels and safety checks come from on-chain data and third-party feeds and can be delayed or wrong. Verify mint addresses through the project’s own channels.'],
        },
        {
          h: 'Transactions are final and rules can change',
          body: [
            'Blockchain transactions cannot be reversed. Losing your keys means losing your funds. Laws on crypto assets and tokenized securities are changing and may restrict access to Oxbow or to the tokens it shows.',
          ],
        },
      ]}
    />
  );
}
