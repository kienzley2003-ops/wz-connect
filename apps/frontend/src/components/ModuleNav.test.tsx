import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModuleNav } from './ModuleNav.js';

describe('ModuleNav', () => {
  it('renderiza só os módulos habilitados para o tenant', () => {
    render(<ModuleNav mods={['masterfila']} />);

    expect(screen.getByRole('link', { name: 'MasterFila' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument();
  });

  it('renderiza vários módulos quando o tenant os tem', () => {
    render(<ModuleNav mods={['masterfila', 'agenda']} />);

    expect(screen.getByRole('link', { name: 'MasterFila' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agenda' })).toBeInTheDocument();
  });

  it('mostra um aviso quando o tenant não tem nenhum módulo', () => {
    render(<ModuleNav mods={[]} />);

    expect(screen.getByText(/nenhum módulo/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('aponta cada item para o caminho do módulo', () => {
    render(<ModuleNav mods={['agenda']} />);

    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/agenda');
  });
});
