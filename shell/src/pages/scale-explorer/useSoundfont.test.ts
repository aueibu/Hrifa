import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileHandleLike } from '../composition-workbench/audio/soundfontStore';

const store = vi.hoisted(() => ({
  canRememberFiles: vi.fn(() => true),
  pickSoundfontHandle: vi.fn(),
  loadSavedSoundfont: vi.fn(async () => null as unknown),
  saveSoundfontHandle: vi.fn(async () => undefined),
  forgetSavedSoundfont: vi.fn(async () => undefined),
  soundfontPermission: vi.fn(async () => 'prompt' as PermissionState),
  requestSoundfontPermission: vi.fn(async () => 'granted' as PermissionState),
}));
vi.mock('../composition-workbench/audio/soundfontStore', () => store);

const library = vi.hoisted(() => ({
  loadSoundfontFile: vi.fn(async (file: File) => ({
    id: `${file.name}#${file.size}`,
    fileName: file.name,
    sizeBytes: file.size,
    presets: [],
  })),
  loadSoundfontData: vi.fn(),
}));
vi.mock('../composition-workbench/audio/soundfontLibrary', () => library);

import { useSoundfont } from './useSoundfont';

const blocked = () => new DOMException('The request is not allowed', 'NotAllowedError');

function handle(getFile: () => Promise<File>): FileHandleLike {
  return { name: 'Heaven.sf2', getFile };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  store.canRememberFiles.mockReturnValue(true);
  store.loadSavedSoundfont.mockResolvedValue(null);
  store.soundfontPermission.mockResolvedValue('prompt');
  store.requestSoundfontPermission.mockResolvedValue('granted');
});

describe('useSoundfont', () => {
  it('opens a picked file and remembers it', async () => {
    const file = new File(['x'], 'Heaven.sf2');
    store.pickSoundfontHandle.mockResolvedValue(handle(async () => file));
    const { result } = renderHook(() => useSoundfont());

    await act(async () => result.current.pick());

    expect(result.current.info?.fileName).toBe('Heaven.sf2');
    expect(store.saveSoundfontHandle).toHaveBeenCalledOnce();
    expect(result.current.canRemember).toBe(true);
  });

  it('drops file handles and explains when the browser refuses to read the picked file', async () => {
    store.pickSoundfontHandle.mockResolvedValue(
      handle(async () => {
        throw blocked();
      })
    );
    const { result } = renderHook(() => useSoundfont());

    await act(async () => result.current.pick());

    expect(result.current.info).toBeNull();
    expect(result.current.canRemember).toBe(false);
    expect(result.current.error).toMatch(/standard file dialog/);
    expect(localStorage.getItem('hrifa.scale-explorer.file-handles-blocked.v1')).toBe('1');
    expect(store.forgetSavedSoundfont).toHaveBeenCalled();
  });

  it('stays on the ordinary file dialog on later visits once handles were refused', () => {
    localStorage.setItem('hrifa.scale-explorer.file-handles-blocked.v1', '1');
    const { result } = renderHook(() => useSoundfont());

    expect(result.current.canRemember).toBe(false);
  });

  it('opens a file from the ordinary dialog without remembering it', async () => {
    const { result } = renderHook(() => useSoundfont());

    await act(async () => {
      await result.current.openFile(new File(['x'], 'Plain.sf2'));
    });

    expect(result.current.info?.fileName).toBe('Plain.sf2');
    expect(store.saveSoundfontHandle).not.toHaveBeenCalled();
  });

  it('offers Reconnect for a remembered file and loads it after permission is granted', async () => {
    const file = new File(['x'], 'Heaven.sf2');
    store.loadSavedSoundfont.mockResolvedValue({
      name: 'Heaven.sf2',
      size: 1,
      handle: handle(async () => file),
    });
    const { result } = renderHook(() => useSoundfont());

    await waitFor(() => expect(result.current.remembered?.name).toBe('Heaven.sf2'));
    expect(result.current.info).toBeNull();

    await act(async () => result.current.reconnect());
    expect(result.current.info?.fileName).toBe('Heaven.sf2');
    expect(result.current.remembered).toBeNull();
  });

  it('loads a remembered file silently when the browser already allows reading it', async () => {
    const file = new File(['x'], 'Heaven.sf2');
    store.loadSavedSoundfont.mockResolvedValue({
      name: 'Heaven.sf2',
      size: 1,
      handle: handle(async () => file),
    });
    store.soundfontPermission.mockResolvedValue('granted');
    const { result } = renderHook(() => useSoundfont());

    await waitFor(() => expect(result.current.info?.fileName).toBe('Heaven.sf2'));
    expect(result.current.remembered).toBeNull();
  });

  it('forgets a remembered file the browser will not let it reopen', async () => {
    store.loadSavedSoundfont.mockResolvedValue({
      name: 'Heaven.sf2',
      size: 1,
      handle: handle(async () => {
        throw blocked();
      }),
    });
    store.soundfontPermission.mockResolvedValue('granted');
    const { result } = renderHook(() => useSoundfont());

    await waitFor(() => expect(result.current.canRemember).toBe(false));
    expect(result.current.remembered).toBeNull();
    expect(result.current.error).toMatch(/standard file dialog/);
  });

  it('treats a failed permission request as a blocked browser', async () => {
    store.loadSavedSoundfont.mockResolvedValue({
      name: 'Heaven.sf2',
      size: 1,
      handle: handle(async () => new File(['x'], 'Heaven.sf2')),
    });
    store.requestSoundfontPermission.mockRejectedValue(blocked());
    const { result } = renderHook(() => useSoundfont());
    await waitFor(() => expect(result.current.remembered).not.toBeNull());

    await act(async () => result.current.reconnect());

    expect(result.current.canRemember).toBe(false);
    expect(result.current.remembered).toBeNull();
  });
});
