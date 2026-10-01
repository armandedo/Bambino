'use client';

import type { BabyProfile } from '@bambino/api-client';
import { Button, Card, CardHeader, DataTable, EmptyState, Modal } from '@bambino/ui';
import { useState } from 'react';
import { BabyProfileForm, MeasurementForm, RecommendationCard } from '@/components/baby-parts';
import { QueryState } from '@/components/query-state';
import { formatDate } from '@/lib/messages';
import { useBabies } from '@/lib/queries';
import { PageTitle } from '../account-nav';

function ageText(days: number): string {
  if (days < 31) return `${days} days old`;
  const months = Math.floor(days / 30.44);
  return months < 24 ? `${months} months old` : `${Math.floor(months / 12)} years old`;
}

function BabySection({ baby }: { baby: BabyProfile }) {
  const [measuring, setMeasuring] = useState(false);
  return (
    <section aria-labelledby={`baby-${baby.id}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`baby-${baby.id}`} className="font-display text-2xl font-bold">
            {baby.nickname}
          </h2>
          <p className="text-foreground-muted">
            {ageText(baby.ageInDays)} · born {formatDate(baby.dateOfBirth)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMeasuring(true)}>
          Add a measurement
        </Button>
      </div>
      {baby.latestRecommendation ? (
        <RecommendationCard recommendation={baby.latestRecommendation} babyName={baby.nickname} />
      ) : (
        <EmptyState title="No recommendation yet" description="Add a measurement to get one." level={3} />
      )}
      <Card padding="none">
        <DataTable
          caption="Growth history"
          className="border-0"
          rows={baby.measurements}
          rowKey={(m) => m.id}
          empty="No measurements yet."
          columns={[
            { key: 'date', header: 'Date', rowHeader: true, cell: (m) => formatDate(m.measuredAt) },
            {
              key: 'height',
              header: 'Height',
              align: 'end',
              cell: (m) => (m.heightMm ? `${(m.heightMm / 10).toFixed(1)} cm` : '—'),
            },
            {
              key: 'weight',
              header: 'Weight',
              align: 'end',
              cell: (m) => (m.weightG ? `${(m.weightG / 1000).toFixed(2)} kg` : '—'),
            },
            {
              key: 'by',
              header: 'Measured by',
              cell: (m) => (m.source === 'STAFF' ? 'Bambino staff' : 'You'),
            },
          ]}
        />
      </Card>
      {baby.sizingHistory.length > 1 ? (
        <Card>
          <CardHeader title="Earlier recommendations" level={3} />
          <ul className="flex flex-col gap-1 text-sm">
            {baby.sizingHistory.slice(1, 6).map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span>{r.recommendedSize.label}</span>
                <span className="text-foreground-muted">{formatDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Modal
        open={measuring}
        onClose={() => setMeasuring(false)}
        title={`New measurement for ${baby.nickname}`}
      >
        <MeasurementForm baby={baby} onDone={() => setMeasuring(false)} />
      </Modal>
    </section>
  );
}

export default function BabyPage() {
  const babies = useBabies();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageTitle
        title="Baby & sizes"
        description="Profiles, growth and size recommendations. Only you and authorised Bambino staff can see these."
        action={<Button onClick={() => setAdding(true)}>Add a baby</Button>}
      />
      <QueryState query={babies} what="your baby profiles">
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title="No baby profiles yet"
              description="Add your baby to get a size recommendation."
              action={<Button onClick={() => setAdding(true)}>Add a baby</Button>}
            />
          ) : (
            <div className="flex flex-col gap-12">
              {list.map((baby) => (
                <BabySection key={baby.id} baby={baby} />
              ))}
            </div>
          )
        }
      </QueryState>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add a baby" size="lg">
        <BabyProfileForm onCreated={() => setAdding(false)} />
      </Modal>
    </>
  );
}
