'use client';

import {
  AdminAssignRoleMutation,
  AdminCustomersQuery,
  AdminRevokeRoleMutation,
  AdminStaffQuery,
} from '@bambino/api-client';
import { Badge, Button, Card, CardHeader, DataTable, SelectField, TextField } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { QueryState, RequirePermission, useAction } from '@/components/kit';
import { api, useStaff } from '@/lib/session';

/** Gives an existing account a staff role. Staff must first register like any customer. */
function GrantRole({ roles }: { roles: { key: string; name: string }[] }) {
  const { can } = useStaff();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const [userId, setUserId] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const people = useQuery({
    queryKey: ['admin-customers-picker', deferred],
    queryFn: async () =>
      (await api.request(AdminCustomersQuery, { search: deferred, page: { first: 10 } })).adminCustomers
        .items,
    enabled: deferred.length >= 2 && can('customer:read'),
  });
  const assign = useAction(() => api.request(AdminAssignRoleMutation, { userId, roleKey }), {
    success: 'Role granted',
    invalidate: [['admin-staff']],
  });
  if (!can('customer:read'))
    return (
      <p className="text-sm text-foreground-muted">Finding accounts needs the customer:read permission.</p>
    );
  return (
    <div className="flex flex-wrap items-end gap-3">
      <TextField
        label="Find account"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Name or email"
      />
      <SelectField
        label="Account"
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        placeholder={deferred.length < 2 ? 'Type 2+ characters' : 'Choose'}
        options={(people.data ?? []).map((p) => ({
          value: p.id,
          label: `${p.firstName} ${p.lastName} (${p.email ?? 'no email'})`,
        }))}
      />
      <SelectField
        label="Role"
        value={roleKey}
        onChange={(event) => setRoleKey(event.target.value)}
        placeholder="Choose"
        options={roles.filter((r) => r.key !== 'CUSTOMER').map((r) => ({ value: r.key, label: r.name }))}
      />
      <Button
        disabled={!userId || !roleKey}
        loading={assign.isPending}
        onClick={() => assign.mutate(undefined)}
      >
        Grant role
      </Button>
    </div>
  );
}

function Users() {
  const { can, viewer } = useStaff();
  const staff = useQuery({ queryKey: ['admin-staff'], queryFn: () => api.request(AdminStaffQuery) });
  const revoke = useAction(
    (v: { userId: string; roleKey: string }) => api.request(AdminRevokeRoleMutation, v),
    {
      success: 'Role removed',
      invalidate: [['admin-staff']],
    },
  );
  return (
    <QueryState query={staff} what="staff">
      {(data) => (
        <div className="flex flex-col gap-6">
          {can('user_role:write') ? (
            <Card>
              <CardHeader
                title="Grant a role"
                description="Every change is recorded in the audit log."
                level={2}
              />
              <GrantRole roles={data.adminRoles} />
            </Card>
          ) : null}
          <DataTable
            caption="Staff"
            rows={data.adminStaffUsers}
            rowKey={(u) => u.id}
            columns={[
              { key: 'name', header: 'Name', rowHeader: true, cell: (u) => `${u.firstName} ${u.lastName}` },
              { key: 'email', header: 'Email', cell: (u) => u.email ?? '—' },
              {
                key: 'roles',
                header: 'Roles',
                cell: (u) => (
                  <span className="flex flex-wrap gap-1">
                    {u.roles
                      .filter((r) => r.key !== 'CUSTOMER')
                      .map((r) => (
                        <span key={r.key} className="inline-flex items-center gap-1">
                          <Badge tone="brand">{r.name}</Badge>
                          {can('user_role:write') && u.id !== viewer?.id ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Remove ${r.name} from ${u.firstName} ${u.lastName}`}
                              onClick={() => revoke.mutate({ userId: u.id, roleKey: r.key })}
                            >
                              ×
                            </Button>
                          ) : null}
                        </span>
                      ))}
                  </span>
                ),
              },
            ]}
          />
          <details className="rounded-xl border border-border bg-surface p-4">
            <summary className="cursor-pointer font-semibold">What each role can do</summary>
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {data.adminRoles.map((role) => (
                <li key={role.id}>
                  <p className="font-semibold">{role.name}</p>
                  <p className="font-mono text-xs text-foreground-muted">
                    {role.permissions.join(', ') || 'No staff permissions'}
                  </p>
                </li>
              ))}
            </ul>
          </details>
          <p className="text-sm text-foreground-muted">
            You cannot remove your own roles, so an administrator cannot lock themselves out by mistake.
          </p>
        </div>
      )}
    </QueryState>
  );
}

export default function UsersPage() {
  return (
    <RequirePermission permission="user_role:read">
      <Users />
    </RequirePermission>
  );
}
