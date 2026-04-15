import axios from 'axios';

const NETWORK_HINT =
  'Typical fixes: (1) Start the backend (`npm run dev` in the `backend` folder). You should see `Server is listening on port 5000` quickly; Mongo connects right after. If Atlas/DNS times out, set `MONGODB_URI=in-memory` in `backend/.env` (see `backend/.env.example`) and restart. ' +
  '(2) Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to your API including `/api`, e.g. `https://your-app.onrender.com/api`. ' +
  '(3) On a hosted API, add your site origin to `CLIENT_URL` (e.g. `http://localhost:3000` with trailing zero).';

export function formatAuthNetworkError(err: unknown, baseURL: string): string {
  if (!axios.isAxiosError(err)) {
    return 'Something went wrong. Please try again.';
  }
  const status = err.response?.status;
  const serverMsg =
    typeof err.response?.data === 'object' && err.response?.data && 'message' in err.response.data
      ? String((err.response.data as { message?: string }).message)
      : undefined;
  if (err.response) {
    return serverMsg || `Request failed (${status}). API base: ${baseURL}`;
  }
  return `Cannot reach API at ${baseURL || '(unknown)'}.

${NETWORK_HINT}`;
}
