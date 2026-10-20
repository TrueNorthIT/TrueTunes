import { useState } from 'react';
import type { ReactElement } from 'react';
import { KONAMI_CODE, useCheatCode } from '../../hooks/useCheatCode';
import { PollAdminDialog } from './PollAdminDialog';

/**
 * Always-mounted (render it once in App.tsx) listener for the Konami code (P-8). Renders nothing
 * until the code is typed, then renders <PollAdminDialog>; closing the dialog hides it again.
 *
 * Pinned by components/polls/__tests__/PollAdminLauncher.test.tsx.
 */
export function PollAdminLauncher(): ReactElement | null {
  const [open, setOpen] = useState(false);
  useCheatCode(KONAMI_CODE, () => setOpen(true));
  return open ? <PollAdminDialog onClose={() => setOpen(false)} /> : null;
}
