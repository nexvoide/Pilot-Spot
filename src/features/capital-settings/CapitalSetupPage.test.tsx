import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { CapitalSettingsProvider } from './CapitalSettingsProvider';
import { CapitalSetupPage } from './CapitalSetupPage';

afterEach(() => window.localStorage.clear());

it('saves a mode in capital settings and restores it without changing existing capital', async () => {
  window.localStorage.setItem('spot-ladder-analyzer:preferences', JSON.stringify({ version: 1, globalCapital: '1000' }));
  const page = () => <MemoryRouter><CapitalSettingsProvider><CapitalSetupPage /></CapitalSettingsProvider></MemoryRouter>;
  const view = render(page());
  expect(screen.getByRole('radio', { name: /balanced/i })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: /extended/i }));
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem('spot-ladder-analyzer:preferences') ?? '{}')).toMatchObject({ globalCapital: '1000', ladderMode: 'extended' }));
  view.unmount();
  render(page());
  expect(screen.getByRole('radio', { name: /extended/i })).toBeChecked();
  expect(screen.getByLabelText(/total planning capital/i)).toHaveValue('1,000');
});

it('keeps capital and mode from existing preferences containing a removed setting', async () => {
  window.localStorage.setItem('spot-ladder-analyzer:preferences', JSON.stringify({ version: 1, globalCapital: '1000', ladderMode: 'extended', aiEnabled: true }));
  render(<MemoryRouter><CapitalSettingsProvider><CapitalSetupPage /></CapitalSettingsProvider></MemoryRouter>);
  expect(screen.getByRole('radio', { name: /extended/i })).toBeChecked();
  expect(screen.getByLabelText(/total planning capital/i)).toHaveValue('1,000');
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem('spot-ladder-analyzer:preferences') ?? '{}')).toEqual({ version: 1, globalCapital: '1000', ladderMode: 'extended' }));
});
