'use client';

/** Where hanzo.id returns to. It exchanges the code and leaves. */
import { useEffect, useState } from 'react';
import { complete } from '@/lib/iam';

export default function Callback() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    complete()
      .then((to) => window.location.replace(to))
      .catch((e) => setError(e instanceof Error ? e.message : 'sign-in failed'));
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      {error ? (
        <>
          <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          <a href="/app" className="mt-4 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
            Try again
          </a>
        </>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">Signing you in…</p>
      )}
    </main>
  );
}
