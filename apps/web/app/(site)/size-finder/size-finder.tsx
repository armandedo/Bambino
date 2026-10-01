'use client';

import type { SizingRecommendation } from '@bambino/api-client';
import { Button, Card, Spinner, buttonClasses } from '@bambino/ui';
import NextLink from 'next/link';
import { useState } from 'react';
import { BabyProfileForm, MeasurementForm, RecommendationCard } from '@/components/baby-parts';
import { QueryState } from '@/components/query-state';
import { useBabies } from '@/lib/queries';
import { useSession } from '@/lib/session';

function NextSteps({ babyId, sizeCode }: { babyId: string; sizeCode: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <NextLink href={`/account/subscription/new?baby=${babyId}`} className={buttonClasses({ size: 'lg' })}>
        Start a subscription in this size
      </NextLink>
      <NextLink
        href={`/shop?size=${encodeURIComponent(sizeCode)}`}
        className={buttonClasses({ size: 'lg', variant: 'outline' })}
      >
        Shop this size
      </NextLink>
    </div>
  );
}

function SignedIn() {
  const babies = useBabies();
  const [result, setResult] = useState<{
    babyId: string;
    babyName: string;
    recommendation: SizingRecommendation;
  } | null>(null);
  const [adding, setAdding] = useState(false);

  if (result) {
    return (
      <div className="flex flex-col gap-6">
        <RecommendationCard recommendation={result.recommendation} babyName={result.babyName} />
        <NextSteps babyId={result.babyId} sizeCode={result.recommendation.recommendedSize.code} />
      </div>
    );
  }

  return (
    <QueryState query={babies} what="your baby profiles">
      {(list) =>
        list.length === 0 || adding ? (
          <Card padding="lg">
            <BabyProfileForm
              onCreated={(baby, recommendation) =>
                setResult({ babyId: baby.id, babyName: baby.nickname, recommendation })
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            <p className="text-foreground-muted">
              Update a measurement for a fresh recommendation, or add another baby.
            </p>
            {list.map((baby) => (
              <Card
                key={baby.id}
                as="section"
                aria-labelledby={`sf-${baby.id}`}
                className="flex flex-col gap-4"
              >
                <h2 id={`sf-${baby.id}`} className="font-display text-xl font-bold">
                  {baby.nickname}
                  {baby.latestRecommendation ? (
                    <span className="font-sans text-base font-normal text-foreground-muted">
                      {' '}
                      · currently {baby.latestRecommendation.recommendedSize.label}
                    </span>
                  ) : null}
                </h2>
                <MeasurementForm
                  baby={baby}
                  onDone={(recommendation) =>
                    setResult({ babyId: baby.id, babyName: baby.nickname, recommendation })
                  }
                />
              </Card>
            ))}
            <Button variant="outline" className="w-fit" onClick={() => setAdding(true)}>
              Add another baby
            </Button>
          </div>
        )
      }
    </QueryState>
  );
}

export function SizeFinder() {
  const { viewer, loading } = useSession();
  if (loading) return <Spinner label="Loading" size="lg" className="mx-auto text-primary" />;
  if (!viewer) {
    return (
      <Card padding="lg" className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-bold">Create a free account to start</h2>
        <p className="text-foreground-muted">
          We save your baby’s measurements to your account so the recommendation improves as your baby grows.
          Only you and authorised Bambino staff can see them.
        </p>
        <div className="flex flex-wrap gap-3">
          <NextLink href="/register?next=/size-finder" className={buttonClasses({ size: 'lg' })}>
            Create an account
          </NextLink>
          <NextLink
            href="/login?next=/size-finder"
            className={buttonClasses({ size: 'lg', variant: 'outline' })}
          >
            Sign in
          </NextLink>
        </div>
      </Card>
    );
  }
  return <SignedIn />;
}
