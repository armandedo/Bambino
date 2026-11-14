import { readFile } from 'node:fs/promises';
import { AGE_GROUPS } from '../../packages/config/src/age-groups';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { queryRows } from './client';
import { createTestDatabase } from './testing';

it('adds all older age-group sizes and preserves existing definitions when replayed', async () => {
  const t = await createTestDatabase();
  try {
    const before = await queryRows<{ code: string; sort_order: number }>(
      t.db,
      sql`SELECT code, sort_order FROM sizes ORDER BY sort_order`,
    );
    const codes = AGE_GROUPS.flatMap((group) => [...group.sizeCodes]).filter((code) => code.endsWith('Y'));
    expect(before.map((row) => row.code)).toEqual(codes);
    await t.db.execute(sql`UPDATE sizes SET label = 'Existing custom label' WHERE code = '17-18Y'`);
    const migration = await readFile(new URL('../migrations/0010_child_sizes.sql', import.meta.url), 'utf8');
    await t.db.execute(sql.raw(migration));
    expect(await queryRows(t.db, sql`SELECT code, sort_order FROM sizes ORDER BY sort_order`)).toEqual(
      before,
    );
    expect(await queryRows(t.db, sql`SELECT label FROM sizes WHERE code = '17-18Y'`)).toEqual([
      { label: 'Existing custom label' },
    ]);
  } finally {
    await t.close();
  }
}, 120_000);
