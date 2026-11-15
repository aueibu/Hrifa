import { useSearchParams } from 'react-router-dom';
import { DockSpikeApp } from './DockSpikeApp';
import { StageApp } from './StageApp';

/**
 * The entry for the `/stage` route once it points here: the old column Stage spike, or the dock Stage spike when the URL
 * has `?dock` (for example `/stage?dock`). `StageApp` itself does not know about the dock spike.
 */
export function StageEntry() {
  const [params] = useSearchParams();
  return params.has('dock') ? <DockSpikeApp /> : <StageApp />;
}
