import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('renders the app header', () => {
    render(<App />);
    expect(screen.getByText('Overprint')).toBeInTheDocument();
  });

  it('shows the empty state drop hint', () => {
    render(<App />);
    expect(screen.getByText('Drop files here')).toBeInTheDocument();
  });
});
