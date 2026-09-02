"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAwsSecrets = loadAwsSecrets;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
async function loadAwsSecrets() {
    try {
        const secretId = process.env.AWS_SECRETS_MANAGER_SECRET_ID;
        if (!secretId) {
            console.log('ℹ️ AWS Secrets Manager not configured, skipping...');
            return;
        }
        const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
        if (!region) {
            console.warn('⚠️ AWS region missing, skipping secrets load');
            return;
        }
        const client = new client_secrets_manager_1.SecretsManagerClient({ region });
        const command = new client_secrets_manager_1.GetSecretValueCommand({
            SecretId: secretId,
        });
        let response;
        try {
            response = await client.send(command);
        }
        catch (err) {
            console.warn('⚠️ AWS Secrets fetch failed (continuing safely):', err?.message || err);
            return;
        }
        if (!response?.SecretString) {
            console.warn('⚠️ AWS secret has no SecretString, skipping');
            return;
        }
        let secrets;
        try {
            secrets = JSON.parse(response.SecretString);
        }
        catch (err) {
            console.warn('⚠️ AWS secret JSON is invalid, skipping');
            return;
        }
        for (const [key, value] of Object.entries(secrets)) {
            if (value !== undefined && value !== null) {
                process.env[key] = value;
            }
        }
        console.log('✅ AWS Secrets loaded successfully');
    }
    catch (err) {
        console.warn('⚠️ AWS Secrets Manager completely skipped (safe mode):', err?.message || err);
    }
}
//# sourceMappingURL=aws-secrets-manager.util.js.map