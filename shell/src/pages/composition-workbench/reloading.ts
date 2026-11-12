/**
 * Set while the page is closing for a reload (opening a project). Once the project's keys are being
 * written to storage, nothing the old page still does may touch them: persistent state skips its
 * localStorage writes, history records nothing (so the unsaved-changes count stays put) and the
 * desk writes nothing. Cleared if the open fails and the page keeps running.
 */
let reloading = false;

export const isReloading = () => reloading;

export function setReloading(value: boolean) {
  reloading = value;
}
