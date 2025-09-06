import createFetchClient from 'openapi-fetch';
import createClient from 'openapi-react-query';
import type { paths } from './api-types';

export const fetchClient = createFetchClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const $api = createClient(fetchClient);