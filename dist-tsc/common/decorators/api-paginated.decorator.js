"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiPaginated = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ApiPaginated = () => (0, common_1.applyDecorators)((0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }), (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, example: 20 }));
exports.ApiPaginated = ApiPaginated;
//# sourceMappingURL=api-paginated.decorator.js.map