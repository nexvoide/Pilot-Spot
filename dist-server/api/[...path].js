import { handleApiRequest } from '../server/http.js';
export default async function handler(request, response) {
    await handleApiRequest(request, response, { publicAccess: true });
}
