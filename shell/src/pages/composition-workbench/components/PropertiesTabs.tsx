import type { CSSProperties, ReactNode } from 'react';
import { liveTabs, type PropertiesKind, type PropertiesTab } from '../scene/sceneSession';
import classes from './PropertiesTabs.module.css';

/**
 * The Properties rail and its two header lines (U6; the approved mock is `arcs/workbench/mock-properties-tabs.html`).
 * Presentational: which tab is open and what a tab holds is `PropertiesBody`'s.
 */

const ICON_PATHS: Record<PropertiesTab, ReactNode> = {
  scene: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16" />
    </>
  ),
  collection: <path d="M4 7h12M4 12h16M8 17h12" />,
  object: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </>
  ),
  modifiers: (
    <>
      <path d="M7 5H4v14h3M17 5h3v14h-3" />
      <path d="M7.5 12c1.5-3 3.2-3 4.5 0s3 3 4.5 0" />
    </>
  ),
  data: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <circle cx="8" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
};

export function TabIcon({ tab }: { tab: PropertiesTab }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={classes.icon}>
      {ICON_PATHS[tab]}
    </svg>
  );
}

const TABS: {
  tab: PropertiesTab;
  label: string;
  hue: string;
  needs: 'none' | 'collection' | 'object';
}[] = [
  { tab: 'scene', label: 'Scene', hue: 'violet', needs: 'none' },
  { tab: 'collection', label: 'Collection', hue: 'yellow', needs: 'collection' },
  { tab: 'object', label: 'Object', hue: 'orange', needs: 'object' },
  { tab: 'modifiers', label: 'Modifiers', hue: 'blue', needs: 'object' },
  { tab: 'data', label: 'Data', hue: 'green', needs: 'object' },
];

export const tabColor = (tab: PropertiesTab): CSSProperties =>
  ({
    '--tab': `var(--mark-${TABS.find((entry) => entry.tab === tab)?.hue ?? 'violet'})`,
  }) as CSSProperties;

/** The vertical icon rail: five tabs in a fixed order; those that do not apply are dimmed with the reason on hover. */
export function PropertiesRail({
  kind,
  active,
  onSelect,
}: {
  kind: PropertiesKind;
  active: PropertiesTab;
  onSelect(tab: PropertiesTab): void;
}) {
  const live = liveTabs(kind);
  return (
    <div
      className={classes.rail}
      role="tablist"
      aria-orientation="vertical"
      aria-label="Properties tabs"
    >
      {TABS.map(({ tab, label, needs }) => {
        const enabled = live.includes(tab);
        const reason = `${label}: select ${needs === 'collection' ? 'a collection' : 'an object'} in the Outliner`;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            className={classes.tab}
            style={tabColor(tab)}
            aria-selected={tab === active}
            aria-disabled={enabled ? undefined : true}
            aria-label={label}
            title={enabled ? label : reason}
            data-info={enabled ? label : reason}
            onClick={() => enabled && onSelect(tab)}
          >
            <TabIcon tab={tab} />
          </button>
        );
      })}
    </div>
  );
}

/** The plain path line: icons and names with a chevron between. */
export function PathLine({ steps }: { steps: { tab: PropertiesTab; name: string }[] }) {
  return (
    <div className={classes.path} aria-label="Path">
      {steps.map((step, index) => (
        <span key={`${index}:${step.name}`} className={classes.step}>
          {index > 0 && (
            <span className={classes.chevron} aria-hidden>
              ›
            </span>
          )}
          <TabIcon tab={step.tab} />
          <span className={classes.stepName}>{step.name}</span>
        </span>
      ))}
    </div>
  );
}

/** The id row: a type icon, then the editable name and any extra slots (the Data tab's user count, New, Unlink). */
export function IdRow({
  tab,
  picker,
  children,
}: {
  tab: PropertiesTab;
  picker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={classes.idrow} style={tabColor(tab)}>
      {picker ?? (
        <span className={classes.idpick} data-plain>
          <TabIcon tab={tab} />
        </span>
      )}
      {children}
    </div>
  );
}
