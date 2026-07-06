export function isLegacyUser(user: any): boolean {
  // Legacy users are users created before Supabase integration and therefore
  // do not have a `supabase_user_id` set. Treat missing/empty supabase id as legacy.
  return !user || !user.supabase_user_id;
}

export function canAccessProtectedFeatures(user: any): boolean {
  // Legacy users: allow access regardless of `email_verified` so long as
  // their account is active (other checks remain elsewhere).
  if (isLegacyUser(user)) return true;

  // Supabase-managed users: require explicit email verification.
  return !!user?.email_verified;
}
