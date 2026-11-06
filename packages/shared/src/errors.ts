/** Единый формат ошибки из docs/06-api.md §1. */

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  INVALID_INIT_DATA: 401,
  TOKEN_EXPIRED: 401,
  UNAUTHORIZED: 401,
  BANNED: 403,
  LEVEL_LOCKED: 403,
  GAME_DISABLED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  ROUND_CLOSED: 409,
  BATTLE_FULL: 409,
  INSUFFICIENT_BALANCE: 422,
  ITEM_LOCKED: 422,
  NOT_ELIGIBLE: 422,
  RATE_LIMITED: 429,
  MAINTENANCE: 503,
  OFFLINE_REQUIRED: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ApiErrorPayload {
  code: ErrorCode;
  message: string;
  request_id: string;
  details: Record<string, unknown>;
}

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Некорректные параметры запроса',
  INVALID_INIT_DATA: 'Не удалось подтвердить данные Telegram',
  TOKEN_EXPIRED: 'Сессия истекла, перезапустите приложение',
  UNAUTHORIZED: 'Требуется авторизация',
  BANNED: 'Аккаунт заблокирован',
  LEVEL_LOCKED: 'Требуется более высокий уровень',
  GAME_DISABLED: 'Игра временно отключена',
  FORBIDDEN: 'Действие недоступно',
  NOT_FOUND: 'Не найдено',
  IDEMPOTENCY_CONFLICT: 'Ключ идемпотентности уже использован с другими параметрами',
  ROUND_CLOSED: 'Ставки закрыты',
  BATTLE_FULL: 'Лобби заполнено',
  INSUFFICIENT_BALANCE: 'Недостаточно средств',
  ITEM_LOCKED: 'Предмет занят в другом раунде',
  NOT_ELIGIBLE: 'Условие не выполнено',
  RATE_LIMITED: 'Слишком много запросов',
  MAINTENANCE: 'Технические работы',
  OFFLINE_REQUIRED: 'Операция недоступна оффлайн',
  INTERNAL: 'Внутренняя ошибка сервера',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message?: string,
    details: Record<string, unknown> = {},
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  toPayload(requestId: string): ApiErrorPayload {
    return {
      code: this.code,
      message: this.message,
      request_id: requestId,
      details: this.details,
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
