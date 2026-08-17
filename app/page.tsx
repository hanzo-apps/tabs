import Link from 'next/link';

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
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Hanzo Tabs</p>
      <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
        Keep tabs on your agents.
      </h1>
      {/* max-w-2xl, not xl: at 576px this sentence breaks with "a browser." alone on
          a third line at every width above the phone. */}
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Your coding agents work in shells on real machines. Tabs puts every one of those shells in
        front of you — split, tiled, and reachable from anywhere you can open a browser.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--primary-hover)]"
        >
          Open Tabs
        </Link>
        <a
          href="https://github.com/hanzoai/tabs"
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-foreground"
        >
          Source
        </a>
      </div>

      {/* The one instruction that makes the product exist. */}
      <div className="mt-14 rounded-xl border border-border bg-background/60 p-5">
        <p className="text-xs text-[var(--text-tertiary)]">Link a machine, and it appears here.</p>
        <pre className="mt-3 overflow-x-auto font-mono text-sm text-foreground">
          <code>hanzo link</code>
        </pre>
        {/* Prose, so it reads at prose size. text-xs is 11px here, which is a size for
            a label like the one above, not for two sentences. */}
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-tertiary)]">
          Run it on a laptop, a workstation, a GPU box — anything with a shell. The machine keeps
          the connection; nothing is exposed to the network it sits on.
        </p>
      </div>

      <dl className="mt-16 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {FACTS.map((f) => (
          <div key={f.k}>
            <dt className="text-sm font-medium text-foreground">{f.k}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.v}</dd>
          </div>
        ))}
      </dl>

      <footer className="mt-20 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-6 text-xs text-[var(--text-disabled)]">
        <span>MIT</span>
        {/* A link is something a thumb has to land on, so it gets the same 44px reach
            the buttons above have. Text this size is 15px tall on its own. */}
        <a
          className="inline-flex min-h-11 items-center hover:text-muted-foreground"
          href="https://hanzo.app"
        >
          hanzo.app
        </a>
        <a
          className="inline-flex min-h-11 items-center hover:text-muted-foreground"
          href="https://github.com/hanzoai/tabs"
        >
          github.com/hanzoai/tabs
        </a>
        <span className="ml-auto">Hanzo AI</span>
      </footer>
    </main>
  );
}
