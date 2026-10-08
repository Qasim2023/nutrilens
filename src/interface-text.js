// Presentation only: keep decimals, URLs, filenames, initials and ellipses intact.
// Raw food descriptions, saved results and exported data are not rewritten.
export function withoutSentencePeriods(value) {
  return String(value ?? '').replace(/(?<!\.)\.(?!\.)(?=\s|$)/gu, (period, offset, text) => {
    const token = text.slice(0, offset + 1).match(/\S+$/)?.[0] || '';
    if (/^(?:[a-z]\.){2,}$/i.test(token) || /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc)\.$/i.test(token)) return period;
    return '';
  });
}
