import { StageEntry } from './stage/StageEntry';

/**
 * The Stage spike page. `/stage` shows the column Stage spike (arc stage); `/stage?dock` shows the dock Stage spike
 * (named dockers on a split tree, arc workbench M3a).
 */
export function StagePage() {
  return <StageEntry />;
}
