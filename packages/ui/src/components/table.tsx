import type { ReactNode } from 'react';
import { cn } from './cn';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: 'start' | 'end';
  /** Marks the column that names the row; it is rendered as a row header for screen readers. */
  rowHeader?: boolean;
  className?: string;
}

export interface DataTableProps<Row> {
  /** Describes the table. Visible by default; `captionHidden` keeps it for screen readers only. */
  caption: ReactNode;
  captionHidden?: boolean;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Shown in place of the body when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

/** A semantic table that scrolls horizontally on small screens instead of breaking the layout. */
export function DataTable<Row>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowKey,
  empty = 'Nothing to show.',
  className,
}: DataTableProps<Row>) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border bg-surface', className)}>
      <table className="w-full border-collapse text-left text-sm">
        <caption
          className={cn(
            captionHidden
              ? 'sr-only'
              : 'px-4 pt-4 pb-2 text-left font-display text-base font-semibold text-foreground',
          )}
        >
          {caption}
        </caption>
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-4 py-3 font-semibold whitespace-nowrap text-foreground-muted',
                  column.align === 'end' && 'text-right',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-foreground-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-border hover:bg-background">
                {columns.map((column) => {
                  const Cell = column.rowHeader ? 'th' : 'td';
                  return (
                    <Cell
                      key={column.key}
                      {...(column.rowHeader ? { scope: 'row' } : {})}
                      className={cn(
                        'px-4 py-3 text-foreground',
                        column.rowHeader && 'font-semibold',
                        column.align === 'end' && 'text-right tabular-nums',
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </Cell>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
