/**
 * Structured server-side error logging.
 *
 * Logs with a consistent prefix and returns a user-friendly message.
 */
export function handleServerError(context: string, error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  console.error(`[${context}] ${message}`);
  return message;
}
