import Link from 'next/link';
import { Anchor, Button, H1, Paragraph, SizableText, XStack, YStack } from '@hanzo/ui';

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
      maxWidth={768}
      marginHorizontal="auto"
      paddingHorizontal="$5"
      paddingVertical="$11"
    >
      <SizableText
        fontFamily="$mono"
        size="$1"
        textTransform="uppercase"
        letterSpacing="0.2em"
        color="var(--text-tertiary)"
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
        marginTop="$4"
        size="$10"
        fontWeight="600"
        style={{ fontSize: 'clamp(var(--text-4xl), 4.5vw, var(--text-5xl))', lineHeight: '1.06' }}
      >
        Keep tabs on your agents.
      </H1>
      {/* 672, not 768: at 576px this sentence breaks with "a browser." alone on
          a third line at every width above the phone. */}
      <Paragraph marginTop="$4.5" maxWidth={672} size="$4" color="var(--muted-foreground)">
        Your coding agents work in shells on real machines. Tabs puts every one of those shells in
        front of you — split, tiled, and reachable from anywhere you can open a browser.
      </Paragraph>

      <XStack marginTop="$6" flexWrap="wrap" alignItems="center" gap="$3">
        <Button variant="primary" size="lg" minHeight={44} render={<Link href="/app" />}>
          Open Tabs
        </Button>
        <Button variant="outline" size="lg" minHeight={44} render={<a href="https://github.com/hanzoai/tabs" />}>
          Source
        </Button>
      </XStack>

      {/* The one instruction that makes the product exist. */}
      <YStack
        marginTop="$9"
        padding="$4.5"
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius="$5"
      >
        <SizableText size="$1" color="var(--text-tertiary)">
          Link a machine, and it appears here.
        </SizableText>
        <SizableText render="pre" marginTop="$3" fontFamily="$mono" size="$2">
          <SizableText render="code" fontFamily="$mono" size="$2">
            hanzo link
          </SizableText>
        </SizableText>
        {/* Prose, so it reads at prose size. The label size above is 11px, which is
            a size for a label, not for two sentences. */}
        <Paragraph marginTop="$3" size="$2" color="var(--text-tertiary)">
          Run it on a laptop, a workstation, a GPU box — anything with a shell. The machine keeps
          the connection; nothing is exposed to the network it sits on.
        </Paragraph>
      </YStack>

      {/* Two columns wherever two fit. A column narrower than 280px is not worth
          having, which is a fact about the text — so it is a basis the row wraps
          on, not a viewport width someone has to keep in sync with the layout. */}
      <XStack render="dl" marginTop="$10" marginBottom={0} flexWrap="wrap" columnGap="$7" rowGap="$6">
        {FACTS.map((f) => (
          <YStack key={f.k} flexBasis={280} flexGrow={1}>
            <SizableText render="dt" size="$2" fontWeight="500">
              {f.k}
            </SizableText>
            <Paragraph render="dd" marginTop="$0.25" size="$2" color="var(--muted-foreground)">
              {f.v}
            </Paragraph>
          </YStack>
        ))}
      </XStack>

      <XStack
        render="footer"
        marginTop="$11"
        paddingTop="$5"
        flexWrap="wrap"
        alignItems="center"
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
          minHeight={44}
          display="inline-flex"
          alignItems="center"
          color="var(--text-disabled)"
          hoverStyle={{ color: 'var(--muted-foreground)' }}
        >
          hanzo.app
        </Anchor>
        <Anchor
          href="https://github.com/hanzoai/tabs"
          size="$1"
          minHeight={44}
          display="inline-flex"
          alignItems="center"
          color="var(--text-disabled)"
          hoverStyle={{ color: 'var(--muted-foreground)' }}
        >
          github.com/hanzoai/tabs
        </Anchor>
        <SizableText size="$1" marginLeft="auto" color="var(--text-disabled)">
          Hanzo AI
        </SizableText>
      </XStack>
    </YStack>
  );
}
