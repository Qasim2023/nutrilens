// Presentation only: keep decimals, URLs, filenames, initials and ellipses intact.
// Raw food descriptions, saved results and exported data are not rewritten.
export function withoutSentencePeriods(value) {
  return String(value ?? '').replace(/(?<!\.)\.(?!\.)(?=\s|$)/gu, (period, offset, text) => {
    const token = text.slice(0, offset + 1).match(/\S+$/)?.[0] || '';
    if (/^(?:[a-z]\.){2,}$/i.test(token) || /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc)\.$/i.test(token)) return period;
    return '';
  });
}

// Remove prose dashes, not signs needed by numbers or technical references.
// Keep whitespace at text-node boundaries so adjacent inline elements stay apart.
export function withoutTextDashes(value) {
  return String(value ?? '').split(/(\r?\n)/u).map(text => {
    const formatted = text.replace(/\S+/gu, (token, tokenOffset) => {
      if (/^(?:[a-z][a-z\d+.-]*:\/\/|www\.|\/|\.{1,2}[/\\]|[a-z]:[/\\])/iu.test(token)
        || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(token)
        || /\.[a-z\d]{1,12}(?:[?#]\S*)?["'”’)\],.;:!?]*$/iu.test(token)) return token;
      if (/^[-\u2010-\u2015]$/u.test(token) && /\d[ \t]+$/u.test(text.slice(0, tokenOffset))
        && /^[ \t]+\d/u.test(text.slice(tokenOffset + token.length))) return token;
      return token.replace(/[-\u2010-\u2015]+/gu, (dash, offset) => {
        const previous = token[offset - 1] || '';
        const next = token[offset + dash.length] || '';
        if (dash.length === 1 && /\d/u.test(next) && (!previous || /[\d(\[{"'=<>~]/u.test(previous)
          || /^\d[\d.,]*[\p{L}°%]+$/u.test(token.slice(0, offset)))) return dash;
        return ' ';
      });
    });
    if (formatted === text) return text;
    return text.match(/^\s*/u)[0] + formatted.trim().replace(/[ \t]{2,}/gu, ' ') + text.match(/\s*$/u)[0];
  }).join('');
}

export function formatDisplayText(value) {
  return withoutTextDashes(withoutSentencePeriods(value));
}
