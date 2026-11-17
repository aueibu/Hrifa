/**
 * M5b: a description edited in place, like `SlotName` renames a name: click the text to edit, Enter or leaving keeps the
 * text, Escape cancels, empty removes it. By default it is ONE row cut with an ellipsis (a block that can shrink: the shelf
 * card). With `lines` above 1 (the line under the preset breadcrumb) the text wraps and is cut with an ellipsis after that
 * many lines, and its edit box is a multi-line field that grows to that many lines; Enter still keeps (the cleaner collapses
 * line breaks, so no break is ever typed in). The caller owns the `editing` flag (the shelf card also opens it from the
 * notepad icon) and stores the text (`onSave`).
 */
import { useRef, useState } from 'react';
import { Textarea, TextInput } from '@mantine/core';
import { MAX_DESCRIPTION } from '../state/generatorLibrary';
import classes from './description.module.css';

/** The text box: starts from the stored text at mount, so each edit begins fresh. */
function Editor({
  value,
  onDone,
  onSave,
  label,
  lines,
}: {
  value: string;
  onDone: () => void;
  onSave: (text: string) => void;
  label: string;
  lines: number;
}) {
  const [text, setText] = useState(value);
  const finished = useRef(false);
  const done = (keep: boolean) => {
    if (finished.current) {
      return;
    }
    finished.current = true;
    if (keep && text.trim() !== value) {
      onSave(text);
    }
    onDone();
  };
  const common = {
    size: 'xs' as const,
    'aria-label': label,
    value: text,
    maxLength: MAX_DESCRIPTION,
    'data-autofocus': true,
    autoFocus: true,
    onBlur: () => done(true),
  };
  if (lines > 1) {
    return (
      <Textarea
        {...common}
        autosize
        minRows={1}
        maxRows={lines}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Enter keeps, it never inserts a line break (a pasted break is collapsed by the cleaner)
            e.preventDefault();
            done(true);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            done(false);
          }
        }}
      />
    );
  }
  return (
    <TextInput
      {...common}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          done(true);
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          done(false);
        }
      }}
    />
  );
}

export function DescriptionLine({
  value,
  editing,
  onEditingChange,
  onSave,
  label,
  prompt,
  lines = 1,
}: {
  /** The stored description ('' = none). */
  value: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Keep the typed text (the caller stores it; the reducer cleans it). Called only when it differs from `value`. */
  onSave: (text: string) => void;
  /** The input's accessible name. */
  label: string;
  /** The faint text shown when there is no description; absent: an empty line shows nothing (and no row). */
  prompt?: string;
  /** How many lines the text may take before the ellipsis (1: one row, `nowrap`). */
  lines?: number;
}) {
  if (editing) {
    return (
      <Editor
        value={value}
        label={label}
        lines={lines}
        onSave={onSave}
        onDone={() => onEditingChange(false)}
      />
    );
  }
  if (!value && prompt === undefined) {
    return null;
  }
  return (
    <button
      type="button"
      className={classes.line}
      data-empty={!value || undefined}
      data-lines={lines > 1 ? lines : undefined}
      onClick={() => onEditingChange(true)}
    >
      {lines > 1 ? (
        <span className={classes.clamp} style={{ WebkitLineClamp: lines }}>
          {value ? value : <span className={classes.prompt}>{prompt}</span>}
        </span>
      ) : value ? (
        value
      ) : (
        <span className={classes.prompt}>{prompt}</span>
      )}
    </button>
  );
}
