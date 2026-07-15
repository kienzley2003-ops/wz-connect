import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantList } from './TenantList.js';
import type { AdminTenant, ModuleCatalogItem } from '../lib/api.js';

const catalog: ModuleCatalogItem[] = [
  { chave: 'masterfila', nome: 'WZ MasterFila' },
  { chave: 'agenda', nome: 'WZ Agenda' },
];

const tenant = (over: Partial<AdminTenant> = {}): AdminTenant => ({
  id: 't1',
  nome: 'Demo Ltda',
  slug: 'demo',
  subdominio: 'demo',
  status: 'ativo',
  dbPlacement: 'default',
  modules: ['masterfila'],
  ...over,
});

const noop = {
  onProvision: async () => {},
  onToggleModule: async () => {},
};

describe('TenantList', () => {
  it('lista as empresas com subdomínio e status', () => {
    render(<TenantList tenants={[tenant()]} catalog={catalog} {...noop} />);

    expect(screen.getByText('Demo Ltda')).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByText('ativo')).toBeInTheDocument();
  });

  it('marca só os módulos contratados pela empresa', () => {
    render(
      <TenantList tenants={[tenant({ modules: ['masterfila'] })]} catalog={catalog} {...noop} />,
    );

    expect(screen.getByRole('checkbox', { name: /masterfila/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /agenda/i })).not.toBeChecked();
  });

  it('oferece provisionar só para empresa ainda não provisionada', () => {
    const { rerender } = render(
      <TenantList tenants={[tenant({ status: 'provisionando' })]} catalog={catalog} {...noop} />,
    );
    expect(screen.getByRole('button', { name: /provisionar/i })).toBeInTheDocument();

    rerender(<TenantList tenants={[tenant({ status: 'ativo' })]} catalog={catalog} {...noop} />);
    expect(screen.queryByRole('button', { name: /provisionar/i })).not.toBeInTheDocument();
  });

  it('avisa quando a empresa não tem banco ainda', () => {
    render(
      <TenantList tenants={[tenant({ status: 'provisionando' })]} catalog={catalog} {...noop} />,
    );
    expect(screen.getByText(/sem banco/i)).toBeInTheDocument();
  });

  it('chama onToggleModule com a lista nova ao marcar um módulo', async () => {
    const onToggleModule = vi.fn(async () => {});
    render(
      <TenantList
        tenants={[tenant({ modules: ['masterfila'] })]}
        catalog={catalog}
        onProvision={noop.onProvision}
        onToggleModule={onToggleModule}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /agenda/i }));

    expect(onToggleModule).toHaveBeenCalledWith('t1', ['masterfila', 'agenda']);
  });

  it('chama onToggleModule sem o módulo ao desmarcar', async () => {
    const onToggleModule = vi.fn(async () => {});
    render(
      <TenantList
        tenants={[tenant({ modules: ['masterfila'] })]}
        catalog={catalog}
        onProvision={noop.onProvision}
        onToggleModule={onToggleModule}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /masterfila/i }));

    expect(onToggleModule).toHaveBeenCalledWith('t1', []);
  });

  it('mostra estado vazio quando não há empresas', () => {
    render(<TenantList tenants={[]} catalog={catalog} {...noop} />);
    expect(screen.getByText(/nenhuma empresa/i)).toBeInTheDocument();
  });
});
