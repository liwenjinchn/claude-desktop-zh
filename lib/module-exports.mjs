import jsTokens from './vendor/js-tokens.mjs';

const trivia = new Set(['WhiteSpace', 'LineTerminatorSequence', 'SingleLineComment', 'MultiLineComment', 'HashbangComment']);
const identifier = token => token?.type === 'IdentifierName' && /^[$A-Z_a-z][$\w]*$/.test(token.value);
const unsupported = () => new Error('Unsupported language-store export. No snippet generated.');

function namedExportList(tokens, start) {
  const entries = [];
  let i = start + 1;
  while (tokens[i]?.value !== '}') {
    if (!identifier(tokens[i])) throw unsupported();
    const local = tokens[i++].value;
    let exported = local;
    if (tokens[i]?.value === 'as') {
      i++;
      if (!identifier(tokens[i])) throw unsupported();
      exported = tokens[i++].value;
    }
    entries.push({ local, exported });
    if (tokens[i]?.value === '}') break;
    if (tokens[i++]?.value !== ',') throw unsupported();
  }
  return { entries, end: i, external: tokens[i + 1]?.value === 'from' };
}

// Resolve only this module's own named exports. Tokenizing keeps imports and
// text inside strings, templates, comments and regexes out of the export list.
export function localNamedExport(source, symbol) {
  if (typeof symbol !== 'string' || !/^[$A-Z_a-z][$\w]*$/.test(symbol)) throw unsupported();
  const tokens = [];
  for (const token of jsTokens(source)) {
    if (token.type === 'Invalid' || token.closed === false) throw unsupported();
    if (!trivia.has(token.type)) tokens.push(token);
  }
  const stack = [], aliases = new Set();
  const pairs = { '(': ')', '[': ']', '{': '}' };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'TemplateHead') { stack.push('template'); continue; }
    if (token.type === 'TemplateMiddle') {
      if (stack.at(-1) !== 'template') throw unsupported();
      continue;
    }
    if (token.type === 'TemplateTail') {
      if (stack.pop() !== 'template') throw unsupported();
      continue;
    }
    if (stack.length === 0 && token.type === 'IdentifierName' && token.value === 'export' && tokens[i + 1]?.value === '{') {
      const list = namedExportList(tokens, i + 1);
      if (!list.external) for (const entry of list.entries) {
        if (entry.local === symbol) aliases.add(entry.exported);
      }
      i = list.end;
      continue;
    }
    if (token.type !== 'Punctuator') continue;
    if (pairs[token.value]) stack.push(pairs[token.value]);
    else if ([')', ']', '}'].includes(token.value) && stack.pop() !== token.value) throw unsupported();
  }
  if (stack.length !== 0 || aliases.size !== 1) throw unsupported();
  return [...aliases][0];
}
