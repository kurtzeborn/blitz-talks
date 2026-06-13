import { TableClient } from '@azure/data-tables';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';

function getTableClient(tableName: string): TableClient {
  return TableClient.fromConnectionString(connectionString, tableName);
}

export const sessionsTable = getTableClient('sessions');
export const topicsTable = getTableClient('topics');
export const votesTable = getTableClient('votes');
export const votersTable = getTableClient('voters');
export const gamekeepersTable = getTableClient('gamekeepers');
