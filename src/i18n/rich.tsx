import { Fragment, type ReactNode } from 'react';
import type { Translate, Vars } from './index';

/**
 * A translated sentence with elements inside it:
 *
 *   rich(t, 'Tap <b>Share</b>, then <link>Add to Shortcuts</link>.', {
 *     b: (text) => <strong>{text}</strong>,
 *     link: (text) => <a href={url}>{text}</a>,
 *   })
 *
 * The sentence stays whole in the dictionary, so German can order it its own
 * way. Tags do not nest. A tag with no entry in `parts` is shown as plain text.
 */
export function rich(
  t: Translate,
  key: string,
  parts: Record<string, (text: string) => ReactNode>,
  vars?: Vars,
): ReactNode {
  const text = t(key, vars);
  const out: ReactNode[] = [];
  const tag = /<(\w+)>(.*?)<\/\1>|<(\w+)\/>/gs;
  let last = 0;
  let i = 0;
  for (let m = tag.exec(text); m; m = tag.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const name = m[1] ?? m[3];
    const render = parts[name];
    out.push(<Fragment key={i++}>{render ? render(m[2] ?? '') : (m[2] ?? '')}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
