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

/**
 * The Track icon (mock-icons.html, variant B, human-approved 2026-11-26): a beam with two hollow bars of
 * different lengths beside it. A Track is not a Properties tab, so it has its own component and color
 * (the theme's teal mark) and shares the tab icons' size and stroke.
 */
export const TRACK_COLOR = { '--tab': 'var(--mark-teal)' } as CSSProperties;

/** What an icon can stand for: one of the five tabs, or a Track (which has no tab of its own). */
export type PathKind = PropertiesTab | 'track';

export function TrackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={classes.icon}>
      <path d="M5 4v16" />
      <rect x="9" y="4.5" width="7" height="6" rx="1" />
      <rect x="9" y="13.5" width="11" height="6" rx="1" />
    </svg>
  );
}

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

/** The color of a kind's icon: its tab's hue, or the Track's teal. */
export const kindColor = (kind: PathKind): CSSProperties =>
  kind === 'track' ? TRACK_COLOR : tabColor(kind);

/** The icon of a kind: its tab icon, or the Track icon. */
export function KindIcon({ kind }: { kind: PathKind }) {
  return kind === 'track' ? <TrackIcon /> : <TabIcon tab={kind} />;
}

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
      {TABS.map(({ tab, label: tabLabel, needs }) => {
        const enabled = live.includes(tab);
        // The Collection tab is also where a Track is shown: it takes the Track's icon, color and name.
        const asTrack = tab === 'collection' && kind === 'track';
        const label = asTrack ? 'Track' : tabLabel;
        const reason = `${label}: select ${needs === 'collection' ? 'a collection or a track' : 'an object'} in the Outliner`;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            className={classes.tab}
            style={asTrack ? TRACK_COLOR : tabColor(tab)}
            aria-selected={tab === active}
            aria-disabled={enabled ? undefined : true}
            aria-label={label}
            title={enabled ? label : reason}
            data-info={enabled ? label : reason}
            onClick={() => enabled && onSelect(tab)}
          >
            {asTrack ? <TrackIcon /> : <TabIcon tab={tab} />}
          </button>
        );
      })}
    </div>
  );
}

/** The plain path line: colored icons and names with a chevron between. */
export function PathLine({ steps }: { steps: { tab: PathKind; name: string }[] }) {
  return (
    <div className={classes.path} aria-label="Path">
      {steps.map((step, index) => (
        <span key={`${index}:${step.name}`} className={classes.step}>
          {index > 0 && (
            <span className={classes.chevron} aria-hidden>
              ›
            </span>
          )}
          <span className={classes.stepIcon} style={kindColor(step.tab)}>
            <KindIcon kind={step.tab} />
          </span>
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
  tab: PathKind;
  picker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={classes.idrow} style={kindColor(tab)}>
      {picker ?? (
        <span className={classes.idpick} data-plain>
          <KindIcon kind={tab} />
        </span>
      )}
      {children}
    </div>
  );
}
