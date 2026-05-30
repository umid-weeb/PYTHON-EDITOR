import { Pool } from 'pg';
import matrix, { RemediationPayload } from './fallbackMatrix';
// The real Google GenAI SDK import is wrapped to allow easy mocking in tests
import * as genai from '@google/generative-ai';

type PgPool = Pool;

export class AiAdaptiveService {
  pool: PgPool;
  genaiClient: any;

  constructor(pool: PgPool, genaiClient?: any) {
    this.pool = pool;
    this.genaiClient = genaiClient ?? genai;
  }

  // Increment fail_count and apply lock if threshold reached
  async recordFailure(userId: string, topic: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `SELECT id, fail_count, mastery_score, is_locked FROM user_learning_patterns WHERE user_id = $1 AND topic = $2 FOR UPDATE`,
        [userId, topic]
      );

      if (res.rows.length === 0) {
        // insert initial row
        await client.query(
          `INSERT INTO user_learning_patterns(user_id, topic, fail_count, mastery_score, is_locked, updated_at) VALUES($1,$2,1,0,false,now())`,
          [userId, topic]
        );
      } else {
        const row = res.rows[0];
        const newFail = row.fail_count + 1;
        let is_locked = row.is_locked;
        if (newFail >= 3 && row.mastery_score < 100) is_locked = true;
        await client.query(
          `UPDATE user_learning_patterns SET fail_count = $1, is_locked = $2, updated_at = now() WHERE id = $3`,
          [newFail, is_locked, row.id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Marks mastery complete: reset fail_count and unlock
  async markMasteryComplete(userId: string, topic: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `SELECT id FROM user_learning_patterns WHERE user_id = $1 AND topic = $2 FOR UPDATE`,
        [userId, topic]
      );
      if (res.rows.length === 0) {
        await client.query(
          `INSERT INTO user_learning_patterns(user_id, topic, fail_count, mastery_score, is_locked, updated_at) VALUES($1,$2,0,100,false,now())`,
          [userId, topic]
        );
      } else {
        await client.query(
          `UPDATE user_learning_patterns SET fail_count = 0, mastery_score = 100, is_locked = false, updated_at = now() WHERE id = $1`,
          [res.rows[0].id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Generate remediation via Gemini (structured output). Always return a valid RemediationPayload.
  async generateRemediation(userId: string, topic: string): Promise<RemediationPayload> {
    // First try remote Gemini API with strict response schema
    try {
      const prompt = `You are an educational assistant. Return JSON with keys: concept_explanation, youtube_embed_id (11-char id), quiz (array of question/options/correct_answer_index). Provide content in Sof o'zbek tilida.`;

      // Example use of genai client; SDKs vary so wrap carefully for tests to mock
      const response = await this.genaiClient.createStructuredOutput({
        model: 'gemini-structured-1',
        prompt,
        schema: {
          type: 'object',
          properties: {
            concept_explanation: { type: 'string' },
            youtube_embed_id: { type: 'string', minLength: 11, maxLength: 11 },
            quiz: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  options: { type: 'array', items: { type: 'string' } },
                  correct_answer_index: { type: 'number' },
                },
                required: ['question', 'options', 'correct_answer_index'],
              },
            },
          },
          required: ['concept_explanation', 'youtube_embed_id', 'quiz'],
        },
        // timeout & retry handled by caller or wrapper
      });

      // SDK may return parsed JSON already
      const parsed = response?.structuredOutput ?? response?.data ?? null;
      if (!parsed) throw new Error('Invalid structured response');

      // Validate minimal shape
      if (typeof parsed.concept_explanation !== 'string' || typeof parsed.youtube_embed_id !== 'string' || !Array.isArray(parsed.quiz)) {
        throw new Error('Malformed structured output');
      }

      // Ensure youtube id length 11, otherwise fallback
      if (parsed.youtube_embed_id.length !== 11) throw new Error('Invalid youtube id');

      return {
        concept_explanation: parsed.concept_explanation,
        youtube_embed_id: parsed.youtube_embed_id,
        quiz: parsed.quiz,
      };
    } catch (err: any) {
      // On any failure (rate limit, timeout, invalid JSON), fall back to local matrix
      // Log the error in real system; here we silently fallback
      const safe = matrix[topic];
      if (safe) return safe as RemediationPayload;
      // If topic unknown, return a generic fallback
      return {
        concept_explanation: "Bu mavzu uchun qisqacha tushuntirish mavjud emas. Iltimos, boshqa mavzuni tanlang.",
        youtube_embed_id: 'dQw4w9WgXcQ',
        quiz: [],
      };
    }
  }
}

export default AiAdaptiveService;
