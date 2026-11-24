import { render, screen } from '@test-utils';
import userEvent from '@testing-library/user-event';
import { DeskProvider } from '../desk';
import { packet, type DataKind, type DataDomain, type DataPacket } from '../model';
import { SendToDeskButton } from './SendToDeskButton';

const sample = (kind: DataKind, domain: DataDomain, value: unknown): DataPacket =>
  packet(kind, domain, [{ id: 'a', value, provenance: [] }]);

const output = (held: DataPacket) => ({
  ref: { instanceId: 'n1', port: 'out' },
  label: 'Out',
  packet: held,
});

function show(held: DataPacket) {
  return render(
    <DeskProvider>
      <SendToDeskButton output={output(held)} />
    </DeskProvider>
  );
}

describe('SendToDeskButton', () => {
  it.each([
    ['a bank of interval', sample('bank', 'interval', 7), 'bank of interval'],
    ['a list of boolean', sample('list', 'boolean', true), 'list of boolean'],
  ])('is disabled for %s, with the reason on hover', (_name, held, kindOfDomain) => {
    show(held);
    const button = screen.getByRole('button', { name: 'Send to desk' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      `No data-block type holds this output yet (${kindOfDomain}).`
    );
  });

  it('is enabled for a packet a type accepts and sends it to the desk', async () => {
    show(sample('list', 'duration', 1));
    const button = screen.getByRole('button', { name: 'Send to desk' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('title');
    await userEvent.click(button);
    expect(await screen.findByText('Sent to the desk.')).toBeInTheDocument();
  });
});
