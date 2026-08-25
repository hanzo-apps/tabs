'use client';

/** Where hanzo.id returns to. It exchanges the code and leaves. */
import { useEffect, useState } from 'react';
import { Anchor, Paragraph, YStack } from '@hanzo/ui';
import { complete } from '@/lib/iam';

export default function Callback() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    complete()
      .then((to) => window.location.replace(to))
      .catch((e) => setError(e instanceof Error ? e.message : 'sign-in failed'));
  }, []);
  return (
    <YStack
      render="main"
      minHeight="100dvh"
      maxWidth={448}
      width="100%"
      marginHorizontal="auto"
      justifyContent="center"
      paddingHorizontal="$5"
    >
      {error ? (
        <>
          <Paragraph size="$2" textAlign="center" color="var(--text-secondary)">
            {error}
          </Paragraph>
          <Anchor
            href="/app"
            size="$1"
            textAlign="center"
            marginTop="$3"
            color="var(--text-tertiary)"
            hoverStyle={{ color: 'var(--text-secondary)' }}
          >
            Try again
          </Anchor>
        </>
      ) : (
        <Paragraph size="$2" textAlign="center" color="var(--text-tertiary)">
          Signing you in…
        </Paragraph>
      )}
    </YStack>
  );
}
