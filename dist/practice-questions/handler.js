"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const aws_1 = require("../common/aws");
const generation_1 = require("../common/generation");
const handler = async () => {
    const level = (0, generation_1.randomLevel)();
    const pk = `LEVEL#${level}`;
    const result = await (0, aws_1.queryByPk)(pk);
    const items = (result.Items || []).filter((i) => i.entityType === 'QUESTION' && i.isPublished);
    const shuffled = items.sort(() => Math.random() - 0.5).slice(0, 10);
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, count: shuffled.length, questions: shuffled })
    };
};
exports.handler = handler;
