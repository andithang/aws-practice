"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAdminToken = verifyAdminToken;
const aws_1 = require("./aws");
async function verifyAdminToken(event) {
    const auth = event.headers.authorization || event.headers.Authorization;
    if (!auth?.startsWith('Bearer '))
        return false;
    const token = auth.replace('Bearer ', '').trim();
    const secret = await (0, aws_1.getSecretJson)(process.env.ADMIN_TOKEN_SECRET_ID);
    return token === secret.token;
}
