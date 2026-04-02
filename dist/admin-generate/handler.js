"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const auth_1 = require("../common/auth");
const generation_1 = require("../common/generation");
const handler = async (event) => {
    if (!(await (0, auth_1.verifyAdminToken)(event))) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }
    const result = await (0, generation_1.generateAndPersistBatch)();
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
};
exports.handler = handler;
