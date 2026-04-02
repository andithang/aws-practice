"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const auth_1 = require("../common/auth");
const aws_1 = require("../common/aws");
const levels = ['practitioner', 'associate', 'professional'];
const handler = async (event) => {
    if (!(await (0, auth_1.verifyAdminToken)(event)))
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    const all = await Promise.all(levels.map((l) => (0, aws_1.queryByPk)(`LEVEL#${l}`)));
    const batches = all.flatMap((r) => (r.Items || []).filter((i) => i.entityType === 'BATCH'));
    return { statusCode: 200, body: JSON.stringify({ batches }) };
};
exports.handler = handler;
