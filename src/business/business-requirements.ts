import { REQUIRED_DOCUMENT_TYPES } from './business.dto';

export interface BusinessRequirementsInput {
  legal_name?: unknown;
  registration_number?: unknown;
  registration_country?: unknown;
  sector?: unknown;
  country?: unknown;
  address?: unknown;
  business_email?: unknown;
  business_phone?: unknown;
  persons?: readonly { role?: string | null }[] | null;
  documents?: readonly { doc_type?: string | null }[] | null;
}

export function missingBusinessRequirements(
  business: BusinessRequirementsInput,
): string[] {
  const missing: string[] = [];
  const requiredFields = [
    'legal_name',
    'registration_number',
    'registration_country',
    'sector',
    'country',
    'address',
    'business_email',
    'business_phone',
  ] as const;

  for (const key of requiredFields) {
    const value = business[key];
    if (typeof value !== 'string' || !value.trim()) missing.push(key);
  }

  const persons = business.persons ?? [];
  if (!persons.some((person) => person.role === 'director')) {
    missing.push('directors');
  }
  if (!persons.some((person) => person.role === 'beneficial_owner')) {
    missing.push('beneficial_owners');
  }

  const documentTypes = new Set(
    (business.documents ?? []).map((document) => document.doc_type),
  );
  for (const type of REQUIRED_DOCUMENT_TYPES) {
    if (!documentTypes.has(type)) missing.push(`document:${type}`);
  }
  return missing;
}
