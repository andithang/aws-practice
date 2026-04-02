"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const aws_1 = require("../common/aws");
const handler = async (event) => {
    const body = JSON.parse(event.body || '{}');
    const secret = await (0, aws_1.getSecretJson)(process.env.ADMIN_TOKEN_SECRET_ID);
    const ok = body.token && body.token === secret.token;
    return {
        statusCode: ok ? 200 : 401,
        body: JSON.stringify({ ok })
    };
};
exports.handler = handler;
