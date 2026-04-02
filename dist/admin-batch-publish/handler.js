"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const auth_1 = require("../common/auth");
const aws_1 = require("../common/aws");
const handler = async (event) => {
    if (!(await (0, auth_1.verifyAdminToken)(event)))
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    const batchId = event.pathParameters?.batchId;
    const body = JSON.parse(event.body || '{}');
    const level = body.level;
    const date = body.date;
    const pk = `LEVEL#${level}`;
    const sk = `DATE#${date}#BATCH#${batchId}`;
    await (0, aws_1.updateStatus)(pk, sk, 'published');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
exports.handler = handler;
