import Link from 'next/link';
import { Anchor, Button, H1, Paragraph, SizableText, XStack, YStack } from '@hanzo/ui';

import { Resume } from '@/components/resume';

export const metadata = {
  title: 'Hanzo Tabs — keep tabs on your agents',
  description:
    'A browser terminal workspace for the machines you have linked. Split, tile and sweep through every shell your coding agents are working in, from a laptop or a phone.',
};

/** One claim per row: what it is, why it is unusual, and nothing else. */
const FACTS = [
  {
    k: 'No server to run',
    v: 'Tabs has no backend. `hanzo link` on a machine publishes a terminal over a zero-trust tunnel, and Tabs frames it. Nothing to deploy, nothing to keep up, no port to open.',
  },
  {
    k: 'Many shells, one link',
    v: 'A shell is a URL. One link serves as many independent tmux sessions as you ask for, so a build can run in one pane while you work in another — on the same box or a different one.',
  },
  {
    k: 'Your terminal, not a viewer',
    v: 'A real xterm.js terminal with 10k lines of scrollback, true colour and a cursor that blinks. Type in it, page through it, resize it.',
  },
  {
    k: 'Closing a pane loses nothing',
    v: 'Every shell is a tmux session that keeps running when the browser goes away. Reopen it by name and the scrollback is exactly where you left it.',
  },
  {
    k: 'Works on a phone',
    v: 'Splits become swipeable pages instead of unreadable slivers, and a key row gives you Esc, Ctrl, Tab and arrows — the keys a soft keyboard does not have.',
  },
  {
    k: 'Open source, MIT',
    v: 'The layout engine, the terminal client and this site. Fork it, host it, or run it against your own machines.',
  },
];

export default function Marketing() {
  return (
    <YStack
      render="main"
      width="100%"
      maxW={768}
      mx="auto"
      px="$5"
      py="$11"
    >
      <Resume />
      <SizableText
        fontFamily="$mono"
        size="$1"
        textTransform="uppercase"
        color="var(--text-tertiary)"
        style={{ letterSpacing: '0.2em' }}
      >
        Hanzo Tabs
      </SizableText>
      {/* The hero grows with the page instead of stepping at a width someone has
          to remember. Both ends are the type scale's own rungs — 32px where a
          phone can hold it, 40px once there is room — so the only new number is
          the rate between them. gui's media props emit nothing without the
          optimizing compiler, measured: `$gtXs` on a background changed no
          pixel, so a breakpoint expressed that way would be silently absent. */}
      <H1
        mt="$4"
        size="$10"
        fontWeight="600"
        style={{ fontSize: 'clamp(var(--text-4xl), 4.5vw, var(--text-5xl))', lineHeight: '1.06' }}
      >
        Keep tabs on your agents.
      </H1>
      {/* 672, not 768: at 576px this sentence breaks with "a browser." alone on
          a third line at every width above the phone. */}
      <Paragraph mt="$4.5" maxW={672} size="$4" color="var(--muted-foreground)">
        Your coding agents work in shells on real machines. Tabs puts every one of those shells in
        front of you — split, tiled, and reachable from anywhere you can open a browser.
      </Paragraph>

      <XStack mt="$6" flexWrap="wrap" items="center" gap="$3">
        <Button variant="primary" size="lg" minH={44} render={<Link href="/app" />}>
          Open Tabs
        </Button>
        <Button variant="outline" size="lg" minH={44} render={<a href="https://github.com/hanzoai/tabs" />}>
          Source
        </Button>
      </XStack>

      {/* The one instruction that makes the product exist. */}
      <YStack
        mt="$9"
        p="$4.5"
        borderWidth={1}
        borderColor="$borderColor"
        rounded="$5"
      >
        <SizableText size="$1" color="var(--text-tertiary)">
          Link a machine, and it appears here.
        </SizableText>
        <SizableText render="pre" mt="$3" fontFamily="$mono" size="$2">
          <SizableText render="code" fontFamily="$mono" size="$2">
            hanzo link
          </SizableText>
        </SizableText>
        {/* Prose, so it reads at prose size. The label size above is 11px, which is
            a size for a label, not for two sentences. */}
        <Paragraph mt="$3" size="$2" color="var(--text-tertiary)">
          Run it on a laptop, a workstation, a GPU box — anything with a shell. The machine keeps
          the connection; nothing is exposed to the network it sits on.
        </Paragraph>
      </YStack>

      {/* Two columns wherever two fit. A column narrower than 280px is not worth
          having, which is a fact about the text — so it is a basis the row wraps
          on, not a viewport width someone has to keep in sync with the layout. */}
      <XStack render="dl" mt="$10" mb={0} flexWrap="wrap" columnGap="$7" rowGap="$6">
        {FACTS.map((f) => (
          <YStack key={f.k} flexBasis={280} grow={1}>
            <SizableText render="dt" size="$2" fontWeight="500">
              {f.k}
            </SizableText>
            <Paragraph render="dd" mt="$0.25" size="$2" color="var(--muted-foreground)">
              {f.v}
            </Paragraph>
          </YStack>
        ))}
      </XStack>

      <XStack
        render="footer"
        mt="$11"
        pt="$5"
        flexWrap="wrap"
        items="center"
        columnGap="$4.5"
        rowGap="$2"
        borderTopWidth={1}
        borderColor="$borderColor"
      >
        <SizableText size="$1" color="var(--text-disabled)">
          MIT
        </SizableText>
        {/* A link is something a thumb has to land on, so it gets the same 44px reach
            the buttons above have. Text this size is 15px tall on its own. */}
        <Anchor
          href="https://hanzo.app"
          size="$1"
          minH={44}
          display="inline-flex"
          items="center"
          color="var(--text-disabled)"
          hoverStyle={{ color: 'var(--muted-foreground)' }}
        >
          hanzo.app
        </Anchor>
        <Anchor
          href="https://github.com/hanzoai/tabs"
          size="$1"
          minH={44}
          display="inline-flex"
          items="center"
          color="var(--text-disabled)"
          hoverStyle={{ color: 'var(--muted-foreground)' }}
        >
          github.com/hanzoai/tabs
        </Anchor>
        <SizableText size="$1" ml="auto" color="var(--text-disabled)">
          Hanzo AI
        </SizableText>
      </XStack>
    </YStack>
  );
}
