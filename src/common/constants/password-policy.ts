// Single source of truth for password rules — previously duplicated
// independently as a bare `6` in register.dto.ts and twice in auth.service.ts.
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_POLICY_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
