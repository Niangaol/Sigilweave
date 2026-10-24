import { chromium } from 'playwright';
try {
  const b = await chromium.launch({ channel: 'msedge' });
  console.log('LAUNCH_OK');
  await b.close();
} catch (e) {
  console.log('LAUNCH_FAIL:', e.message.split('\n')[0]);
}
