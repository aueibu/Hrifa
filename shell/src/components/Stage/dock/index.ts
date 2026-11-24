export { DockStage, type DockStageProps } from './DockStage';
export { useStageApi, StageApiContext, type StageApi } from './stageApi';
export {
  dropTarget,
  layoutTree,
  sendToRoot,
  type DropInput,
  type DropResult,
  type DropTarget,
  type DropZone,
  type TreeGeometry,
  type DockerPlacement,
  type SplitterPlacement,
} from './dockLayout';
export { PanelsMenu, type PanelsMenuProps } from './PanelsMenu';
export { WorkspaceTabs, type WorkspaceTabsProps } from './WorkspaceTabs';
export {
  addWorkspace,
  canNameWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  renameWorkspace,
  setActiveWorkspace,
  takenWorkspaceNames,
} from './workspaceStore';
export {
  buildStageRegistry,
  instanceId,
  isReservedPanelId,
  knownPanelIds,
  parseInstanceId,
  useStageRegistry,
  type PanelInstance,
  type PanelKind,
} from './instances';
export {
  DOCK_COMMAND_LABELS,
  DOCK_KEYS,
  keyLabel,
  matchCommand,
  type DockCommand,
  type KeySpec,
} from './keyMap';
export { NamePrompt, type NamePromptProps } from './NamePrompt';
export { validateName } from './dockerName';
