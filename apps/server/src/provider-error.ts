export function aiProviderErrorMessage(error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : null;
  if (status === 401) return "The OpenAI API key is invalid or has been revoked.";
  if (status === 429) return "This OpenAI project has exhausted its quota or credits. Check API billing.";
  if (status === 403 || status === 404) return "This OpenAI project cannot access the configured model.";
  return "The OpenAI request failed. Check the connection and try again.";
}
