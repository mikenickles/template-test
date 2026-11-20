/** A failure worth showing in the chat as is: a missing key, an unknown model, a rate limit. */
export class ProviderError extends Error {
  name = 'ProviderError';
}
