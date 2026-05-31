import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

/**
 * SAFE AWS SECRETS LOADER
 * - NEVER crashes app
 * - Skips gracefully if credentials/region are missing
 * - Works locally + production (Render safe)
 */
export async function loadAwsSecrets(): Promise<void> {
  try {
    const secretId = process.env.AWS_SECRETS_MANAGER_SECRET_ID;

    // If not configured → just skip silently
    if (!secretId) {
      console.log('ℹ️ AWS Secrets Manager not configured, skipping...');
      return;
    }

    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

    // If region missing → skip safely (DON'T crash Render)
    if (!region) {
      console.warn('⚠️ AWS region missing, skipping secrets load');
      return;
    }

    const client = new SecretsManagerClient({ region });

    const command = new GetSecretValueCommand({
      SecretId: secretId,
    });

    let response;

    try {
      response = await client.send(command);
    } catch (err: any) {
      console.warn('⚠️ AWS Secrets fetch failed (continuing safely):', err?.message || err);
      return;
    }

    if (!response?.SecretString) {
      console.warn('⚠️ AWS secret has no SecretString, skipping');
      return;
    }

    let secrets: Record<string, string>;

    try {
      secrets = JSON.parse(response.SecretString);
    } catch (err) {
      console.warn('⚠️ AWS secret JSON is invalid, skipping');
      return;
    }

    for (const [key, value] of Object.entries(secrets)) {
      if (value !== undefined && value !== null) {
        process.env[key] = value;
      }
    }

    console.log('✅ AWS Secrets loaded successfully');
  } catch (err: any) {
    // FINAL SAFETY NET (NEVER crash app)
    console.warn(
      '⚠️ AWS Secrets Manager completely skipped (safe mode):',
      err?.message || err,
    );
  }
}