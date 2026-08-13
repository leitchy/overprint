import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { HelpButton } from './help-button';
import { useToolStore } from '@/stores/tool-store';
import { getHelpSection } from '@/i18n/help/en';

beforeEach(() => {
  useToolStore.setState({ gettingStartedOpen: false, gettingStartedSection: null });
});
afterEach(() => cleanup());

describe('HelpButton', () => {
  it('renders nothing for an unknown section id', () => {
    const { container } = render(<HelpButton sectionId="does-not-exist" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the section summary and a Learn more link when opened', () => {
    render(<HelpButton sectionId="variations" />);
    fireEvent.click(screen.getByRole('button')); // only the "?" trigger exists yet
    expect(screen.getByText(getHelpSection('variations')!.summary)).toBeTruthy();
    expect(screen.getByText(/Learn more/)).toBeTruthy();
  });

  it('Learn more opens the Getting Started drawer at this section', () => {
    render(<HelpButton sectionId="audit" />);
    fireEvent.click(screen.getByRole('button')); // open popover
    fireEvent.click(screen.getByText(/Learn more/));
    const s = useToolStore.getState();
    expect(s.gettingStartedOpen).toBe(true);
    expect(s.gettingStartedSection).toBe('audit');
  });

  it('Escape closes only the popover, not a surrounding modal that also listens on document', () => {
    const modalEscape = vi.fn();
    const modalHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') modalEscape();
    };
    document.addEventListener('keydown', modalHandler); // bubble-phase, like useModalClose
    try {
      render(<HelpButton sectionId="variations" />);
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText(/Learn more/)).toBeTruthy();
      // Escape from inside the modal subtree → HelpButton's capture listener wins.
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByText(/Learn more/)).toBeNull(); // popover closed
      expect(modalEscape).not.toHaveBeenCalled(); // modal NOT closed
    } finally {
      document.removeEventListener('keydown', modalHandler);
    }
  });
});

describe('getting-started store deep-link', () => {
  it('openGettingStarted sets the target section', () => {
    useToolStore.getState().openGettingStarted('gps');
    expect(useToolStore.getState().gettingStartedOpen).toBe(true);
    expect(useToolStore.getState().gettingStartedSection).toBe('gps');
  });

  it('toggleGettingStarted clears the target section (Help-menu open → first section)', () => {
    useToolStore.getState().openGettingStarted('gps'); // open at gps
    useToolStore.getState().toggleGettingStarted(); // toggle closed
    useToolStore.getState().toggleGettingStarted(); // toggle open again from the menu
    expect(useToolStore.getState().gettingStartedOpen).toBe(true);
    expect(useToolStore.getState().gettingStartedSection).toBeNull();
  });
});
