import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NodePalette } from './NodePalette';

/**
 * Provider-specific category is collapsed by default; expand it before
 * querying its child entries.
 */
function expandProviderSpecific() {
  const header = screen.getByRole('button', { name: /プロバイダー専用/ });
  fireEvent.click(header);
}

describe('NodePalette - omniReference entry', () => {
  it('renders the Seedance Omni Reference entry as draggable when provider is seedance', () => {
    render(<NodePalette selectedProvider="seedance" onDragStart={vi.fn()} />);
    expandProviderSpecific();
    const entry = screen.getByText('Seedance Omni Reference');
    const wrapper = entry.closest('div[draggable]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute('draggable')).toBe('true');
  });

  it('disables (non-draggable) the Seedance Omni Reference entry when provider is runway', () => {
    render(<NodePalette selectedProvider="runway" onDragStart={vi.fn()} />);
    expandProviderSpecific();
    const entry = screen.queryByText('Seedance Omni Reference');
    expect(entry).not.toBeNull();
    const wrapper = entry!.closest('div[draggable]');
    expect(wrapper?.getAttribute('draggable')).toBe('false');
  });

  it('disables (non-draggable) the Seedance Omni Reference entry when no provider is selected', () => {
    render(<NodePalette selectedProvider={undefined} onDragStart={vi.fn()} />);
    expandProviderSpecific();
    const entry = screen.queryByText('Seedance Omni Reference');
    expect(entry).not.toBeNull();
    const wrapper = entry!.closest('div[draggable]');
    expect(wrapper?.getAttribute('draggable')).toBe('false');
  });

  it('calls onDragStart with the omniReference node type when dragged on a seedance palette', () => {
    const onDragStart = vi.fn();
    render(<NodePalette selectedProvider="seedance" onDragStart={onDragStart} />);
    expandProviderSpecific();
    const entry = screen.getByText('Seedance Omni Reference');
    const wrapper = entry.closest('div[draggable]');
    expect(wrapper).not.toBeNull();
    fireEvent.dragStart(wrapper!);
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragStart).toHaveBeenCalledWith(expect.anything(), 'omniReference');
  });

  it('does not call onDragStart when the entry is disabled (non-seedance provider)', () => {
    const onDragStart = vi.fn();
    render(<NodePalette selectedProvider="runway" onDragStart={onDragStart} />);
    expandProviderSpecific();
    const entry = screen.getByText('Seedance Omni Reference');
    const wrapper = entry.closest('div[draggable]');
    fireEvent.dragStart(wrapper!);
    expect(onDragStart).not.toHaveBeenCalled();
  });
});
