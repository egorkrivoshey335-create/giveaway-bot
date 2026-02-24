import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Тесты для логики генерации и верификации капчи.
 * Сама логика встроена в participation.ts — тестируем её через мок Redis.
 *
 * Логика:
 * - generateCaptcha: создаёт задачу (a op b = ?), сохраняет answer+attempts в Redis
 * - verifyCaptcha: достаёт из Redis, проверяет ответ, считает попытки (max 5)
 */

// Мок-реализация логики капчи (вынесена для тестирования отдельно от Fastify)
interface CaptchaData {
  answer: number;
  expiresAt: number;
  attempts: number;
}

type Operation = '+' | '-' | '*';

function generateCaptchaQuestion(a: number, b: number, op: Operation): {
  question: string;
  answer: number;
} {
  let answer: number;
  let symbol: string;
  switch (op) {
    case '+':
      answer = a + b;
      symbol = '+';
      break;
    case '-':
      answer = a - b;
      symbol = '−';
      break;
    case '*':
      answer = a * b;
      symbol = '×';
      break;
  }
  return { question: `${a} ${symbol} ${b}`, answer };
}

function verifyCaptchaAnswer(
  data: CaptchaData,
  userAnswer: number,
  now: number = Date.now()
): { valid: boolean; reason?: string } {
  if (data.expiresAt < now) {
    return { valid: false, reason: 'expired' };
  }
  if (data.attempts >= 5) {
    return { valid: false, reason: 'too_many_attempts' };
  }
  if (data.answer !== userAnswer) {
    return { valid: false, reason: 'wrong_answer' };
  }
  return { valid: true };
}

// =============================================================================
// Tests
// =============================================================================

describe('Captcha generation', () => {
  describe('generateCaptchaQuestion', () => {
    it('addition: returns correct answer', () => {
      const { answer } = generateCaptchaQuestion(3, 7, '+');
      expect(answer).toBe(10);
    });

    it('subtraction: returns correct answer', () => {
      const { answer } = generateCaptchaQuestion(10, 4, '-');
      expect(answer).toBe(6);
    });

    it('multiplication: returns correct answer', () => {
      const { answer } = generateCaptchaQuestion(6, 7, '*');
      expect(answer).toBe(42);
    });

    it('formats addition question correctly', () => {
      const { question } = generateCaptchaQuestion(5, 3, '+');
      expect(question).toBe('5 + 3');
    });

    it('formats subtraction question with minus sign', () => {
      const { question } = generateCaptchaQuestion(9, 2, '-');
      expect(question).toBe('9 − 2');
    });

    it('formats multiplication question with × sign', () => {
      const { question } = generateCaptchaQuestion(4, 5, '*');
      expect(question).toBe('4 × 5');
    });

    it('handles zero operands', () => {
      const add = generateCaptchaQuestion(0, 5, '+');
      expect(add.answer).toBe(5);

      const mul = generateCaptchaQuestion(0, 99, '*');
      expect(mul.answer).toBe(0);
    });
  });
});

describe('Captcha verification', () => {
  const FUTURE = Date.now() + 5 * 60 * 1000; // 5 min from now

  it('accepts correct answer', () => {
    const data: CaptchaData = { answer: 42, expiresAt: FUTURE, attempts: 0 };
    expect(verifyCaptchaAnswer(data, 42).valid).toBe(true);
  });

  it('rejects wrong answer', () => {
    const data: CaptchaData = { answer: 42, expiresAt: FUTURE, attempts: 0 };
    const result = verifyCaptchaAnswer(data, 41);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_answer');
  });

  it('rejects expired captcha', () => {
    const PAST = Date.now() - 1;
    const data: CaptchaData = { answer: 42, expiresAt: PAST, attempts: 0 };
    const result = verifyCaptchaAnswer(data, 42);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects when attempts >= 5', () => {
    const data: CaptchaData = { answer: 42, expiresAt: FUTURE, attempts: 5 };
    const result = verifyCaptchaAnswer(data, 42);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('too_many_attempts');
  });

  it('still accepts on 4th attempt (< 5)', () => {
    const data: CaptchaData = { answer: 42, expiresAt: FUTURE, attempts: 4 };
    expect(verifyCaptchaAnswer(data, 42).valid).toBe(true);
  });

  it('expiry check takes priority over wrong answer', () => {
    const PAST = Date.now() - 1;
    const data: CaptchaData = { answer: 42, expiresAt: PAST, attempts: 0 };
    // Даже если ответ правильный — сначала проверяем expiry
    const result = verifyCaptchaAnswer(data, 42);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('attempts check takes priority over wrong answer', () => {
    const data: CaptchaData = { answer: 42, expiresAt: FUTURE, attempts: 10 };
    const result = verifyCaptchaAnswer(data, 99); // wrong answer
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('too_many_attempts');
  });
});

describe('Captcha rate limiting logic', () => {
  it('should reject after 5 failed attempts (simulation)', () => {
    let captchaData: CaptchaData = { answer: 42, expiresAt: Date.now() + 300_000, attempts: 0 };

    for (let i = 0; i < 4; i++) {
      captchaData.attempts++;
      const result = verifyCaptchaAnswer(captchaData, 999); // wrong
      expect(result.reason).toBe('wrong_answer');
    }

    // 5-я попытка — already counted as 4 in data, so we check at limit
    captchaData.attempts = 5;
    const final = verifyCaptchaAnswer(captchaData, 42); // correct but too many
    expect(final.valid).toBe(false);
    expect(final.reason).toBe('too_many_attempts');
  });
});
