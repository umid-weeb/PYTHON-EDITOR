import AiAdaptiveService from '../services/aiAdaptiveService';
import matrix from '../services/fallbackMatrix';

// Mocks
const mockPool = {
  connect: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  }),
} as any;

describe('AiAdaptiveService.generateRemediation', () => {
  it('returns structured output from Gemini when available', async () => {
    const fakeGenai = {
      createStructuredOutput: jest.fn().mockResolvedValue({
        structuredOutput: {
          concept_explanation: 'Test explained in Uzbek',
          youtube_embed_id: 'AAAAAAAAAAA',
          quiz: [{ question: 'Q', options: ['A'], correct_answer_index: 0 }],
        },
      }),
    };

    const svc = new AiAdaptiveService(mockPool as any, fakeGenai as any);
    const out = await svc.generateRemediation('user-1', 'binary_search');
    expect(out.youtube_embed_id).toBe('AAAAAAAAAAA');
    expect(out.concept_explanation).toContain('Test explained');
  });

  it('falls back to local matrix on SDK failure (rate limit)', async () => {
    const fakeGenai = {
      createStructuredOutput: jest.fn().mockRejectedValue(new Error('429 rate limit')),
    };
    const svc = new AiAdaptiveService(mockPool as any, fakeGenai as any);
    const out = await svc.generateRemediation('user-2', 'bfs');
    expect(out).toEqual(matrix['bfs']);
  });

  it('falls back to generic when topic unknown', async () => {
    const fakeGenai = {
      createStructuredOutput: jest.fn().mockRejectedValue(new Error('timeout')),
    };
    const svc = new AiAdaptiveService(mockPool as any, fakeGenai as any);
    const out = await svc.generateRemediation('user-3', 'unknown_topic');
    expect(out.youtube_embed_id).toBe('dQw4w9WgXcQ');
  });
});

describe('AiAdaptiveService.recordFailure', () => {
  it('inserts a new row if none exists', async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    const pool = { connect: jest.fn().mockResolvedValue(client) } as any;
    const svc = new AiAdaptiveService(pool, {} as any);
    await expect(svc.recordFailure('u1', 'binary_search')).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalled();
  });
});
