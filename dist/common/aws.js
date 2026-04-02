"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tableName = void 0;
exports.getSecretJson = getSecretJson;
exports.putItem = putItem;
exports.queryByPk = queryByPk;
exports.updateStatus = updateStatus;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const ddb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
const secrets = new client_secrets_manager_1.SecretsManagerClient({});
exports.tableName = process.env.TABLE_NAME;
async function getSecretJson(secretId) {
    const out = await secrets.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId }));
    return JSON.parse(out.SecretString ?? '{}');
}
async function putItem(item) {
    return ddb.send(new lib_dynamodb_1.PutCommand({ TableName: exports.tableName, Item: item }));
}
async function queryByPk(pk) {
    return ddb.send(new lib_dynamodb_1.QueryCommand({
        TableName: exports.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': pk }
    }));
}
async function updateStatus(pk, sk, status) {
    return ddb.send(new lib_dynamodb_1.UpdateCommand({
        TableName: exports.tableName,
        Key: { PK: pk, SK: sk },
        UpdateExpression: 'SET #s = :s, publishedAt = :p',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': status, ':p': new Date().toISOString() }
    }));
}
