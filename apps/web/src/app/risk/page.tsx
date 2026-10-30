import type { Metadata } from 'next';
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
      lede="Trading tokens, and copying other wallets' trades, can lose you all of your money. These are the main risks."
      sections={[
        {
          h: 'Memecoins are extremely volatile',
          body: ['Most memecoins have no underlying value and can fall to zero in minutes. New tokens trade in thin markets and can move by hundreds of percent.'],
        },
        {
          h: 'Copying is not a strategy',
          body: [
            'A wallet that made money before can lose it next. Oxbow only sees the trades it has read, so profit figures and win rates are partial. Some wallets trade with information or tools you do not have, split trades across wallets, or exit while others are still copying them in.',
            'By the time you copy a trade the price has usually moved, sometimes because many people are copying the same wallet. Expect worse prices than the wallet you follow got.',
          ],
        },
        {
          h: 'Rug pulls',
          body: ['Token creators and insiders can pull liquidity or dump large holdings at any time, leaving buyers unable to sell at a fair price. Check the safety panel before you buy.'],
        },
        {
          h: 'Token authorities and extensions',
          body: [
            'A token with a mint authority can be inflated. One with a freeze authority can have holders’ balances frozen. Token-2022 extensions such as transfer hooks, transfer fees and permanent delegates can block, tax or move transfers. Oxbow flags these, but checks can miss things.',
          ],
        },
        {
          h: 'Slippage, front-running and failed transactions',
          body: [
            'Large trades in thin markets move the price a lot. Bots can trade ahead of you. Set a slippage limit you are comfortable with; transactions can fail and still cost network fees.',
          ],
        },
        {
          h: 'Smart contracts and third parties',
          body: [
            'Trades route through Jupiter and third-party pools. Bugs, exploits, outages or changes in any of them can cause losses. There is no insurance.',
          ],
        },
        {
          h: 'Data can be wrong',
          body: ['Prices, trades, profit figures and safety checks come from on-chain data and third-party feeds and can be delayed or wrong. Verify token addresses through the project’s own channels.'],
        },
        {
          h: 'Transactions are final and rules can change',
          body: [
            'Blockchain transactions cannot be reversed. Losing your keys means losing your funds. Laws on crypto assets are changing and may restrict access to Oxbow or to the tokens it shows.',
          ],
        },
      ]}
    />
  );
}
