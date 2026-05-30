import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export async function loadAwsSecrets(): Promise<void> {
  const secretId = process.env.AWS_SECRETS_MANAGER_SECRET_ID;
  if (!secretId) {
    return;
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error('AWS region is required when using AWS Secrets Manager');
  }

  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`AWS Secrets Manager secret ${secretId} has no string payload`);
  }

  let secrets: Record<string, string>;
  try {
    secrets = JSON.parse(response.SecretString) as Record<string, string>;
  } catch (error) {
    throw new Error('AWS Secrets Manager secret JSON payload is malformed');
  }

  Object.entries(secrets).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      process.env[key] = value;
    }
  });
}
