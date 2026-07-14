import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App', () => {
  it('renderiza o título do WZ Connect', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'WZ Connect' })).toBeInTheDocument();
  });
});
