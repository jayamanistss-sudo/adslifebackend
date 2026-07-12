// Single source of truth for password rules — previously duplicated
// independently as a bare `6` in register.dto.ts and twice in auth.service.ts.
export const PASSWORD_MIN_LENGTH = 6;

// The web register form already required uppercase + digit + special char
// client-side (Register.tsx's `validators.password`), but the server only
// ever enforced the length — so mobile, and any direct API caller, could
// register with a password as weak as "aaaaaa". This mirrors that same
// pattern server-side, the actual enforcement boundary.
export const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{6,}$/;
export const PASSWORD_POLICY_MESSAGE =
  `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, a number, and a special character`;
