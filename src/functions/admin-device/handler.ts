import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateAdminToken } from '../common/auth';
import { deleteDeviceItem, listDevices as listDeviceItems } from '../common/device-store';
import { json } from '../common/http';

const deviceRecordSk = 'METADATA';
const routePath = '/api/admin/devices';
const legacyRoutePath = '/devices';

type AdminDeviceSummary = {
  deviceId: string;
  email?: string;
  userAgent?: string;
  expiresAt: string;
  expiresAtEpochSeconds: number;
  createdAt: string;
  updatedAt: string;
  ttl: number;
};

function isListRoute(path: string): boolean {
  return path === routePath || path === legacyRoutePath;
}

function isRevokeRoute(path: string): boolean {
  return path.startsWith(`${routePath}/`) || path.startsWith(`${legacyRoutePath}/`);
}

function toAdminDeviceSummary(record: Record<string, unknown>): AdminDeviceSummary | null {
  const deviceIdFromItem = typeof record.deviceId === 'string' ? record.deviceId : '';
  const pk = typeof record.PK === 'string' ? record.PK : '';
  const deviceIdFromPk = pk.startsWith('DEVICE#') ? pk.replace('DEVICE#', '') : '';
  const deviceId = deviceIdFromItem || deviceIdFromPk;

  if (!deviceId) {
    return null;
  }

  return {
    deviceId,
    email: typeof record.email === 'string' && record.email.trim() ? record.email.trim() : undefined,
    userAgent: typeof record.userAgent === 'string' && record.userAgent.trim() ? record.userAgent.trim() : undefined,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : '',
    expiresAtEpochSeconds: typeof record.expiresAtEpochSeconds === 'number' ? record.expiresAtEpochSeconds : 0,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    ttl: typeof record.ttl === 'number' ? record.ttl : 0
  };
}

async function revokeDevice(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const deviceId = event.pathParameters?.deviceId?.trim();
  if (!deviceId) {
    return json(400, { error: 'Missing deviceId' });
  }

  try {
    await deleteDeviceItem({ PK: `DEVICE#${deviceId}`, SK: deviceRecordSk });
    const response = json(204, {});
    return { ...response, body: '' };
  } catch {
    return json(500, { error: 'Failed to revoke device' });
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const auth = await validateAdminToken(event);
  if (!auth.ok) {
    return json(401, { error: auth.message || 'Unauthorized' });
  }

  const { httpMethod } = event;
  const targetPath = event.resource || event.path || '';

  if (httpMethod === 'GET' && isListRoute(targetPath)) {
    try {
      const devices = await listDeviceItems();
      const sanitized = devices
        .map((item) => toAdminDeviceSummary(item))
        .filter((item): item is AdminDeviceSummary => item !== null);
      return json(200, sanitized);
    } catch {
      return json(500, { error: 'Failed to list devices' });
    }
  }

  if (httpMethod === 'DELETE' && isRevokeRoute(targetPath)) return revokeDevice(event);
  return json(404, { error: 'Not found' });
};
