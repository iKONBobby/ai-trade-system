// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AIReviewAction from '../AIReviewAction';

afterEach(cleanup);

describe('AIReviewAction', () => {
  it('offers a post-scan review for an unreviewed result', () => {
    const onReview = vi.fn();
    render(<AIReviewAction status="not_requested" loading={false} onReview={onReview} />);

    fireEvent.click(screen.getByRole('button', { name: '补做 AI 复核' }));

    expect(onReview).toHaveBeenCalledOnce();
  });

  it('disables duplicate submission and announces loading', () => {
    render(<AIReviewAction status="running" loading onReview={() => {}} />);

    const button = screen.getByRole('button', { name: 'AI 复核中…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the persisted reviewed state instead of another action', () => {
    render(<AIReviewAction status="done" reviewedAt="2026-09-08T04:00:00.000Z" loading={false} onReview={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent('AI 复核已记录');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
