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

const knownKenyanBanks = [
  { name: 'I&M Bank', key: 'i&m bank', code: '57' },
  { name: 'Kenya Commercial Bank', key: 'kenya commercial bank', code: '01' },
  { name: 'Equity Bank', key: 'equity bank', code: '68' },
  { name: 'Co-operative Bank', key: 'co-operative bank', code: '11' },
  { name: 'ABSA Bank Kenya', key: 'absa bank kenya', code: '03' },
  {
    name: 'Standard Chartered Bank Kenya',
    key: 'standard chartered bank kenya',
    code: '02',
  },
  { name: 'Stanbic Bank Kenya', key: 'stanbic bank kenya', code: '31' },
  { name: 'NCBA Bank', key: 'ncba bank', code: '07' },
  { name: 'Family Bank', key: 'family bank', code: '19' },
  { name: 'Diamond Trust Bank', key: 'diamond trust bank', code: '63' },
  { name: 'Prime Bank', key: 'prime bank', code: '10' },
  { name: 'Bank of Africa Kenya', key: 'bank of africa kenya', code: '19' },
  { name: 'Ecobank Kenya', key: 'ecobank kenya', code: '43' },
  {
    name: 'Guaranty Trust Bank Kenya',
    key: 'guaranty trust bank kenya',
    code: '53',
  },
  { name: 'Citibank Kenya', key: 'citibank kenya', code: '16' },
  { name: 'Sidian Bank', key: 'sidian bank', code: '66' },
  { name: 'HFC Bank', key: 'hfc bank', code: '61' },
  { name: 'National Bank of Kenya', key: 'national bank of kenya', code: '12' },
  { name: 'Postbank Kenya', key: 'postbank kenya', code: '62' },
  { name: 'Access Bank Kenya', key: 'access bank kenya', code: '26' },
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
  const map = new Map(
    knownKenyanBanks.map(({ key, code }) => [normalize(key), code]),
  );

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
    for (const [name, code] of entries) {
      map.set(name, code);
    }
  }
  return map;
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
    const knownCodes = new Set<string>();
    for (const bank of knownKenyanBanks) {
      const code = map.get(normalize(bank.key)) ?? bank.code;
      knownCodes.add(code);
      destinations.push({
        name: bank.name,
        code,
        type: 'kepss',
        currency: 'KES',
      });
    }

    const displayNameByCode = new Map<string, string>();
    for (const [alias, code] of map) {
      if (knownCodes.has(code)) continue;
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
