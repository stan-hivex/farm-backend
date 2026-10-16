export type KenyanBankEnvironment = Record<string, unknown>;

export interface KenyanPaystackDestination {
  name: string;
  code: string;
  type: 'kepss' | 'mobile_money';
  currency: 'KES';
}

const environmentKeys = [
  'KE',
  'KE_BANKS',
  'BANK_CODES',
  'PAYSTACK_BANK_CODE_MAP',
];

function parseMapValue(
  rawValue: unknown,
  environmentKey: string,
): Record<string, unknown> {
  let value = rawValue;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error(
        `Invalid JSON in Kenyan bank mapping environment variable ${environmentKey}`,
      );
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const objectValue = value as Record<string, unknown>;
  let kenyaMap = objectValue.KE;
  if (typeof kenyaMap === 'string') {
    try {
      kenyaMap = JSON.parse(kenyaMap);
    } catch {
      throw new Error(
        `Invalid JSON in Kenyan bank mapping environment variable ${environmentKey}.KE`,
      );
    }
  }
  if (kenyaMap && typeof kenyaMap === 'object' && !Array.isArray(kenyaMap)) {
    return kenyaMap as Record<string, unknown>;
  }
  return objectValue;
}

function getKenyanBankMap(
  environment: KenyanBankEnvironment = process.env,
): Map<string, string> {
  for (const environmentKey of environmentKeys) {
    const rawValue = environment[environmentKey];
    if (!rawValue) continue;

    const parsedMap = parseMapValue(rawValue, environmentKey);
    const entries = Object.entries(parsedMap)
      .filter(
        ([, code]) => typeof code === 'string' || typeof code === 'number',
      )
      .map(([name, code]) => [normalize(name), String(code).trim()] as const)
      .filter(([name, code]) => name.length > 0 && code.length > 0);
    if (entries.length > 0) return new Map(entries);
  }
  return new Map();
}

export function normalize(name: string): string {
  return (name ?? '').toLowerCase().trim();
}

export function getBankCode(
  input: string,
  environment: KenyanBankEnvironment = process.env,
): string | null {
  const key = normalize(input);
  if (!key) return null;

  const map = getKenyanBankMap(environment);
  const exactCode = map.get(key);
  if (exactCode) return exactCode;

  for (const code of map.values()) {
    if (code.toLowerCase() === key) return code;
  }

  if (key.length < 3) return null;
  const matchingCodes = new Set(
    [...map.entries()]
      .filter(
        ([name]) =>
          name.length >= 3 && (key.includes(name) || name.includes(key)),
      )
      .map(([, code]) => code),
  );
  return matchingCodes.size === 1 ? [...matchingCodes][0] : null;
}

export function normalizeKenyanPhoneNumber(phone: string): string {
  return phone
    .trim()
    .replace(/^\+254/, '0')
    .replace(/^254/, '0');
}

export function getAllKenyanBanks(
  environment: KenyanBankEnvironment = process.env,
  type?: string,
): KenyanPaystackDestination[] {
  const map = getKenyanBankMap(environment);
  const destinations: KenyanPaystackDestination[] = [];
  const normalizedType = type?.trim().toLowerCase();

  if (normalizedType !== 'mobile_money') {
    const displayNameByCode = new Map<string, string>();
    for (const [alias, code] of map) {
      const currentName = displayNameByCode.get(code);
      if (!currentName || alias.length > currentName.length) {
        displayNameByCode.set(code, alias);
      }
    }

    for (const [code, alias] of displayNameByCode) {
      destinations.push({
        name: alias
          .split(' ')
          .map((part) =>
            /^(i&m|kcb|ncba|dtb|boa|gtbank|nbk|hfc)$/.test(part)
              ? part.toUpperCase()
              : part.charAt(0).toUpperCase() + part.slice(1),
          )
          .join(' '),
        code,
        type: 'kepss',
        currency: 'KES',
      });
    }
  }

  if (!normalizedType || normalizedType === 'mobile_money') {
    destinations.push({
      name: 'M-Pesa',
      code: 'MPESA',
      type: 'mobile_money',
      currency: 'KES',
    });
  }

  return destinations.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
