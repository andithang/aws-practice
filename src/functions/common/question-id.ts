import { TableKey } from './aws';

export function encodeQuestionId(key: TableKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeQuestionId(id: string): TableKey | null {
  if (!id) return null;

  try {
    const parsed = JSON.parse(Buffer.from(id, 'base64url').toString('utf8')) as Partial<TableKey>;
    if (!parsed || typeof parsed.PK !== 'string' || typeof parsed.SK !== 'string') return null;
    if (!parsed.PK.startsWith('LEVEL#')) return null;
    if (!parsed.SK.includes('#Q#')) return null;
    return { PK: parsed.PK, SK: parsed.SK };
  } catch {
    return null;
  }
}
