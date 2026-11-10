import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './server.mjs';

const directory = new URL('./outputs/', import.meta.url);
mkdirSync(directory, { recursive: true });
const env = {
  PILOT_DATA_FILE: fileURLToPath(new URL('pilot-preview-data.json', directory)),
  PILOT_SHARE_NUTRITION: 'true'
};
const server = createAppServer(env, { localPreview: true });
const port = Number(process.env.PILOT_PREVIEW_PORT || 4180);
server.listen(port, '127.0.0.1', () => {
  const address = 'http://127.0.0.1:' + server.address().port + '/';
  console.log('Pilot preview: ' + address);
  console.log('Choose Coach, Athlete, or Parent. No access code is needed.');
});
