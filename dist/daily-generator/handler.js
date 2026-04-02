"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const generation_1 = require("../common/generation");
const handler = async () => {
    const result = await (0, generation_1.generateAndPersistBatch)();
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
};
exports.handler = handler;
