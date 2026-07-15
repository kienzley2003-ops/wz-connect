import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from './Dashboard.js';
import type { DashboardResponse } from '@wz/shared';

const data = (over: Partial<DashboardResponse> = {}): DashboardResponse => ({
  tenant: 'demo',
  from: '2026-07-14T00:00:00.000Z',
  to: '2026-07-14T13:00:00.000Z',
  metrics: [
    {
      module: 'masterfila',
      metric: 'tickets_atendidos',
      total: 128,
      points: 4,
      lastBucket: '2026-07-14T13:00:00.000Z',
    },
  ],
  ...over,
});

describe('Dashboard', () => {
  it('mostra o total de cada métrica', () => {
    render(<Dashboard data={data()} />);

    expect(screen.getByText('tickets_atendidos')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
  });

  it('agrupa as métricas por módulo', () => {
    render(
      <Dashboard
        data={data({
          metrics: [
            { module: 'masterfila', metric: 'a', total: 1, points: 1, lastBucket: null },
            { module: 'agenda', metric: 'b', total: 2, points: 1, lastBucket: null },
          ],
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: /masterfila/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /agenda/i })).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há métricas', () => {
    render(<Dashboard data={data({ metrics: [] })} />);

    expect(screen.getByText(/nenhuma métrica/i)).toBeInTheDocument();
  });

  it('mostra estado de carregando quando não há dados ainda', () => {
    render(<Dashboard data={null} />);

    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('formata números grandes de forma legível', () => {
    render(
      <Dashboard
        data={data({
          metrics: [
            {
              module: 'masterfila',
              metric: 'tickets',
              total: 1234567,
              points: 9,
              lastBucket: null,
            },
          ],
        })}
      />,
    );

    // pt-BR: separador de milhar
    expect(screen.getByText('1.234.567')).toBeInTheDocument();
  });
});
