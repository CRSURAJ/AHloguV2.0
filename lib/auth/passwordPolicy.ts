export const PASSWORD_REQUIREMENTS = [
  "At least 8 characters",
  "Contains at least 1 number",
  "Contains at least 1 special character",
  "Contains at least 1 uppercase letter",
  "Contains at least 1 lowercase letter",
];

export const PASSWORD_REQUIREMENTS_TEXT = PASSWORD_REQUIREMENTS.join("\n- ");

export function getPasswordPolicyError(
  password: string,
  label = "Password",
): string {
  const value = password.trim();

  if (value.length < 8) {
    return `${label} must be at least 8 characters.`;
  }

  if (!/[0-9]/.test(value)) {
    return `${label} must contain at least 1 number.`;
  }

  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(value)) {
    return `${label} must contain at least 1 special character.`;
  }

  if (!/[A-Z]/.test(value)) {
    return `${label} must contain at least 1 uppercase letter.`;
  }

  if (!/[a-z]/.test(value)) {
    return `${label} must contain at least 1 lowercase letter.`;
  }

  return "";
}
