"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.winstonConfig = void 0;
const winston = __importStar(require("winston"));
const { combine, timestamp, printf, colorize, errors, json } = winston.format;
const devFormat = combine(colorize({ all: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), printf(({ timestamp, level, message, context, stack, requestId }) => {
    const ctx = context ? `[${context}]` : '';
    const rid = requestId ? ` (req:${requestId})` : '';
    return `${timestamp} ${level} ${ctx}${rid} ${message}${stack ? '\n' + stack : ''}`;
}));
const prodFormat = combine(timestamp(), errors({ stack: true }), json());
exports.winstonConfig = {
    transports: [
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
        }),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: combine(timestamp(), errors({ stack: true }), json()),
            maxsize: 10 * 1024 * 1024,
            maxFiles: 10,
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            format: combine(timestamp(), json()),
            maxsize: 20 * 1024 * 1024,
            maxFiles: 14,
        }),
    ],
    exceptionHandlers: [
        new winston.transports.File({ filename: 'logs/exceptions.log' }),
    ],
    rejectionHandlers: [
        new winston.transports.File({ filename: 'logs/rejections.log' }),
    ],
};
//# sourceMappingURL=winston.config.js.map