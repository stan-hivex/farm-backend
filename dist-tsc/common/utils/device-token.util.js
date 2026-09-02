"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDeviceToken = verifyDeviceToken;
function verifyDeviceToken(token) {
    if (!token)
        return null;
    try {
        return JSON.parse(token);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=device-token.util.js.map