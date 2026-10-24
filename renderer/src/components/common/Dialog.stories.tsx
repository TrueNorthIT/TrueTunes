import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Dialog } from './Dialog';
import { PillButton } from './PillButton';
import styles from './Dialog.module.css';

// A native <dialog> opened on mount, so each story shows it open.
const meta = {
  title: 'Common/Dialog',
  component: Dialog,
  args: {
    title: 'Remove this playlist?',
    onClose: fn(),
    size: 'sm',
    children: (
      <p className={styles.note}>“Friday afternoon” and its 14 tracks will be gone for everyone who joined it.</p>
    ),
    actions: (
      <>
        <PillButton>Cancel</PillButton>
        <PillButton variant="danger">Remove</PillButton>
      </>
    ),
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirm: Story = {};
export const Medium: Story = { args: { size: 'md', title: 'About this release' } };
export const Large: Story = {
  args: {
    size: 'lg',
    title: 'What’s new',
    headContent: <span className={styles.note}>v1.0.50</span>,
    children: (
      <div className={styles.stack}>
        {[
          'Albums split the page 70/30',
          'Colours and shadows come from tokens',
          'Seek bar shared by the three players',
        ].map((t) => (
          <p key={t} className={styles.note}>
            {t}
          </p>
        ))}
      </div>
    ),
    actions: <PillButton variant="primary">Got it</PillButton>,
  },
};
/** A form dialog: Enter submits, and a backdrop click does not close it. */
export const Form: Story = {
  args: {
    title: 'New playlist',
    onSubmit: fn(),
    children: (
      <div className={styles.stack}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input className={styles.input} type="text" placeholder="Playlist name" />
        </label>
      </div>
    ),
    actions: (
      <>
        <PillButton>Cancel</PillButton>
        <PillButton variant="primary" type="submit">
          Create
        </PillButton>
      </>
    ),
  },
};
export const FormWithError: Story = {
  args: {
    ...Form.args,
    children: (
      <div className={styles.stack}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input className={styles.input} type="text" defaultValue="Friday afternoon" />
        </label>
        <p className={styles.error} role="alert">
          You already have a playlist with that name.
        </p>
      </div>
    ),
  },
};
export const NoActions: Story = { args: { actions: undefined, title: 'Heads up' } };
