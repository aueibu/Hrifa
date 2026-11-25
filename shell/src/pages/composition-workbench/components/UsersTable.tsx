import type { ReactNode } from 'react';
import { UnstyledButton } from '@mantine/core';
import { rationalToNumber } from '../musicalTime';
import { barBeatText } from '../positionWording';
import { lengthText, type SharedUserRow } from '../scene/sharedUsersTable';
import classes from './UsersTable.module.css';

interface UsersTableProps {
  rows: readonly SharedUserRow[];
  /** The meter that bars and beats are counted in, such as `4/4`. */
  meter: string;
  /** The row of this object is marked "(this one)" and shown bold. */
  currentId?: string | null;
  /** With this, an object row is clickable and calls it with the object's id. */
  onSelect?: (id: string) => void;
  /** An extra last column; its content is up to the caller (Make single user on the Desk). */
  action?: (row: SharedUserRow) => ReactNode;
  id?: string;
}

/**
 * The one "Used by" table (L5, L5b): Object, Collection, Starts, Length, one row per user. Properties
 * shows it folded; the Desk card's popover shows it open with an action per row.
 */
export function UsersTable({ rows, meter, currentId, onSelect, action, id }: UsersTableProps) {
  return (
    <div id={id} className={classes.wrap}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th>Object</th>
            <th>Collection</th>
            <th>Starts</th>
            <th>Length</th>
            {action && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const clickable = row.kind === 'object' && onSelect !== undefined;
            return (
              <tr
                key={`${row.kind}:${row.id}:${row.entry?.slot ?? ''}:${index}`}
                className={clickable ? classes.row : undefined}
                data-selected={row.id === currentId}
                onClick={clickable ? () => onSelect(row.id) : undefined}
              >
                <td>
                  {clickable ? (
                    <UnstyledButton className={classes.name}>{row.name}</UnstyledButton>
                  ) : (
                    row.name
                  )}
                  {row.id === currentId ? ' (this one)' : ''}
                </td>
                <td>{row.collection}</td>
                <td>
                  {row.kind === 'object' ? barBeatText(rationalToNumber(row.start), meter) : ''}
                </td>
                <td>{row.kind === 'object' ? lengthText(row.duration, meter) : ''}</td>
                {action && <td>{action(row)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
