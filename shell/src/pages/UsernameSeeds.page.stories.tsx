import type { Meta, StoryObj } from '@storybook/react-vite';
import { UsernameSeedsPage } from './UsernameSeeds.page';

const meta = {
  component: UsernameSeedsPage,
} satisfies Meta<typeof UsernameSeedsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
