'use client';

/** Where hanzo.id returns to. It exchanges the code and leaves. */
import { useEffect, useState } from 'react';
import { complete } from '@/lib/iam';

export default function Callback() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    complete(window.location.search, `${window.location.origin}/auth/callback`)
      .then((to) => window.location.replace(to))
      .catch((e) => setError(e instanceof Error ? e.message : 'sign-in failed'));
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      {error ? (
        <>
          <p className="text-sm text-neutral-300">{error}</p>
          <a href="/app" className="mt-4 text-xs text-neutral-500 hover:text-neutral-300">
            Try again
          </a>
        </>
      ) : (
        <p className="text-sm text-neutral-500">Signing you in…</p>
      )}
    </main>
  );
}
