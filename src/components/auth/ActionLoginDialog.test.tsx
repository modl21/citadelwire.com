import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionLoginDialog } from './ActionLoginDialog';
import { TestApp } from '@/test/TestApp';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr'),
  },
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  addEventListener = vi.fn();
  close = vi.fn();
  send = vi.fn();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }
}

describe('ActionLoginDialog', () => {
  it('renders login options without removed heading or helper copy', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    render(
      <TestApp>
        <ActionLoginDialog open onOpenChange={() => undefined} action="comment on this post" />
      </TestApp>,
    );

    expect(screen.getByText('Create guest account')).toBeInTheDocument();
    expect(screen.getByText('Sign in with Primal')).toBeInTheDocument();
    expect(screen.queryByText('Join CITADEL WIRE')).not.toBeInTheDocument();
    expect(screen.queryByText(/Choose how you want/)).not.toBeInTheDocument();
  });
});
