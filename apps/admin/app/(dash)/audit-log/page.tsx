'use client';

import { AdminAuditLogsQuery } from '@bambino/api-client';
import { DataTable, TextField } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { Pager, QueryState, RequirePermission, usePager } from '@/components/kit';
import { formatDate } from '@/lib/format';
import { api } from '@/lib/session';

function Change({ previous, next }: { previous: string | null; next: string | null }) {
  if (!previous && !next) return <span className="text-foreground-muted">—</span>;
  return (
    <details>
      <summary className="cursor-pointer text-link">View</summary>
      <pre className="mt-2 max-w-md overflow-x-auto rounded bg-surface-muted p-2 font-mono text-xs whitespace-pre-wrap">
        {previous ? `Before: ${previous}\n` : ''}
        {next ? `After: ${next}` : ''}
      </pre>
    </details>
  );
}

function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const type = useDeferredValue(entityType.trim());
  const id = useDeferredValue(entityId.trim());
  const pager = usePager();
  const logs = useQuery({
    queryKey: ['admin-audit', type, id, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminAuditLogsQuery, {
          entityType: type || null,
          entityId: id || null,
          page: { first: 50, after: pager.after },
        })
      ).adminAuditLogs,
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Entity type"
          value={entityType}
          onChange={(event) => {
            setEntityType(event.target.value);
            pager.reset();
          }}
          placeholder="e.g. garment, return_request"
        />
        <TextField
          label="Entity id"
          value={entityId}
          onChange={(event) => {
            setEntityId(event.target.value);
            pager.reset();
          }}
        />
      </div>
      <QueryState query={logs} what="the audit log">
        {(page) => (
          <>
            <DataTable
              caption="Audit log"
              captionHidden
              rows={page.items}
              rowKey={(e) => e.id}
              empty="No entries match."
              columns={[
                { key: 'when', header: 'When', rowHeader: true, cell: (e) => formatDate(e.createdAt, true) },
                { key: 'who', header: 'Who', cell: (e) => e.actorName ?? 'System' },
                {
                  key: 'action',
                  header: 'Action',
                  cell: (e) => <span className="font-mono text-xs">{e.action}</span>,
                },
                {
                  key: 'entity',
                  header: 'Record',
                  cell: (e) => (
                    <span className="font-mono text-xs">
                      {e.entityType} {e.entityId.slice(0, 8)}
                    </span>
                  ),
                },
                {
                  key: 'change',
                  header: 'Change',
                  cell: (e) => <Change previous={e.previousValue} next={e.newValue} />,
                },
                {
                  key: 'ip',
                  header: 'IP',
                  cell: (e) => <span className="font-mono text-xs">{e.ipAddress ?? '—'}</span>,
                },
              ]}
            />
            <Pager pager={pager} pageInfo={page.pageInfo} />
          </>
        )}
      </QueryState>
    </div>
  );
}

export default function AuditLogPage() {
  return (
    <RequirePermission permission="audit_log:read">
      <AuditLog />
    </RequirePermission>
  );
}
