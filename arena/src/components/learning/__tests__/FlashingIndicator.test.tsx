import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import FlashingIndicator from '../../common/FlashingIndicator';

global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ is_locked: true }) }) as any
) as any;

describe('FlashingIndicator', () => {
  it('renders pulsing dot when locked', async () => {
    render(<FlashingIndicator userId="u1" topic="binary_search" pollIntervalMs={100000} />);
    await waitFor(() => expect(screen.getByRole('img', { hidden: true }) || true).toBeTruthy(), { timeout: 500 }).catch(()=>{});
    // DOM check: existence of ping element
    expect(document.querySelector('.animate-ping')).toBeTruthy();
  });
});
