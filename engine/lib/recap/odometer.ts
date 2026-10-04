export type OdometerPart = { kind: 'digit'; value: number } | { kind: 'text'; value: string };

/** Splits a card's big string into rolling digits and static text so the
 *  overlay can render a digit-strip odometer with commas/units untouched. */
export function splitForOdometer(big: string): OdometerPart[] {
  const parts: OdometerPart[] = [];
  for (const ch of big) {
    if (ch >= '0' && ch <= '9') {
      parts.push({ kind: 'digit', value: Number(ch) });
    } else {
      const last = parts[parts.length - 1];
      if (last?.kind === 'text') last.value += ch;
      else parts.push({ kind: 'text', value: ch });
    }
  }
  return parts;
}
