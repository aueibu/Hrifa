/**
 * A generic visualizer panel: titled by its current view (a menu in its header strip switches it among Lattice, EDO
 * fit, Dissonance curve and Isomorphic keyboard), with a pop-out that opens the same view full size in a window.
 */
import { useState } from 'react';
import { ActionIcon, Menu, Modal } from '@mantine/core';
import { VIZ_VIEWS, VIZ_VIEW_LABEL, vizName, type VizId, type VizView } from '../state/layout';
import { VIEW_TIP } from '../state/vizState';
import { DissonanceBody } from './DissonanceView';
import { EdoFitBody } from './EdoFitView';
import { ChevronDownIcon, ExpandIcon } from './icons';
import { IsoBody } from './IsoView';
import { LatticeBody } from './LatticePanel';
import { Strip, Tip, useViz } from './ui';
import mock from './lab.module.css';
import classes from './panels.module.css';

/** The view's content (no header): the same component in the panel and in the pop-out. */
export function VizContent({ id, view, big }: { id: VizId; view: VizView; big?: boolean }) {
  switch (view) {
    case 'lattice':
      return <LatticeBody id={id} big={big} />;
    case 'edo':
      return <EdoFitBody id={id} />;
    case 'dissonance':
      return <DissonanceBody />;
    case 'iso':
      return <IsoBody id={id} />;
  }
}

export function VisualizerPanel({ id }: { id: VizId }) {
  const viz = useViz();
  const view = viz.view(id);
  const label = vizName(id, view);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Strip
        title={
          <span className={mock.vizTitle}>
            <Tip k={VIEW_TIP[view]}>{label}</Tip>
            <Tip k="vizView" as="control">
              <span>
                <Menu position="bottom-start" withinPortal shadow="none">
                  <Menu.Target>
                    <button
                      type="button"
                      className={mock.vizMenuBtn}
                      aria-label={`View: ${label}. Change view`}
                    >
                      <ChevronDownIcon />
                    </button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {VIZ_VIEWS.map((v) => (
                      <Menu.Item
                        key={v}
                        data-active={v === view ? 'true' : undefined}
                        onClick={() => viz.setView(id, v)}
                      >
                        {VIZ_VIEW_LABEL[v]}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              </span>
            </Tip>
          </span>
        }
      >
        <Tip k="vizPopOut" as="control">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Open ${label} in a large window`}
            onClick={() => setOpen(true)}
          >
            <ExpandIcon />
          </ActionIcon>
        </Tip>
      </Strip>
      <div className={classes.panelBody}>
        <VizContent id={id} view={view} />
      </div>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={label}
        size="min(64rem, 94vw)"
        transitionProps={{ duration: 0 }}
      >
        <div className={classes.vizModal}>
          <VizContent id={id} view={view} big />
        </div>
      </Modal>
    </>
  );
}
