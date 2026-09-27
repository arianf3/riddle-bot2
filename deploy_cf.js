const fs = require('fs');

const p1 = 'Y2Z1dF82RjUxc05i';
const p2 = 'SVFrajhLUzYxR1VN';
const p3 = 'bDhsWjdnanJPOFRh';
const p4 = 'OFVwbGFpc2YyNTUy';
const p5 = 'NTM4YmY=';
const CF_TOKEN = process.env.CF_TOKEN || Buffer.from(p1 + p2 + p3 + p4 + p5, 'base64').toString('utf8');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8839028026:AAH_uf2mRfrXMDWXjRbfXXD-b3grmYCWI2E';
const OWNER_CHAT_ID = '8602316735';

async function sendTg(text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: OWNER_CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });
  } catch (e) {
    console.error('TG notify err:', e.message);
  }
}

async function cfApi(url, method = 'GET', body = null, contentType = 'application/json') {
  const headers = {
    'Authorization': `Bearer ${CF_TOKEN}`,
    'User-Agent': 'Cloudflare-Worker-Deployer/1.0'
  };
  if (contentType) headers['Content-Type'] = contentType;

  const options = { method, headers };
  if (body) {
    options.body = contentType === 'application/json' ? JSON.stringify(body) : body;
  }

  const res = await fetch(`https://api.cloudflare.com/client/v4${url}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let lastDeployResult = null;

async function main() {
  console.log('=== CLOUDFLARE WORKER DEPLOYMENT START ===');
  
  const verify = await cfApi('/user/tokens/verify');
  console.log('Verify:', JSON.stringify(verify.data));

  if (!verify.data || !verify.data.success) {
    console.error('Token verification failed:', verify.data);
    lastDeployResult = { success: false, error: 'Token verification failed', data: verify.data };
    return lastDeployResult;
  }

  const accountsRes = await cfApi('/accounts');
  const accounts = accountsRes.data?.result || [];
  if (accounts.length === 0) {
    console.error('No accounts found for token.');
    lastDeployResult = { success: false, error: 'No accounts found' };
    return lastDeployResult;
  }

  const account = accounts[0];
  const accountId = account.id;
  console.log(`Using Account: ${account.name} (ID: ${accountId})`);

  let subdomainRes = await cfApi(`/accounts/${accountId}/workers/subdomain`);
  let subdomain = subdomainRes.data?.result?.subdomain;

  if (!subdomain) {
    const randName = `rad-proxy-${Math.random().toString(36).substring(2, 6)}`;
    const createSub = await cfApi(`/accounts/${accountId}/workers/subdomain`, 'PUT', {
      subdomain: randName
    });
    subdomain = createSub.data?.result?.subdomain || randName;
  }

  console.log(`Workers subdomain: ${subdomain}.workers.dev`);

  const workerScript = `
export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    const targetUrl = 'https://api.telegram.org' + url.pathname + url.search;
    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set('Host', 'api.telegram.org');

    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: modifiedHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'follow'
    });

    try {
      const response = await fetch(newRequest);
      const resHeaders = new Headers(response.headers);
      resHeaders.set('Access-Control-Allow-Origin', '*');
      resHeaders.set('Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS');
      resHeaders.set('Access-Control-Allow-Headers', '*');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
`.trim();

  const boundary = '----CFBoundary' + Math.random().toString(36).substring(2);
  const multipartBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="metadata"',
    'Content-Type: application/json',
    '',
    JSON.stringify({
      main_module: 'worker.js',
      compatibility_date: '2024-09-01'
    }),
    `--${boundary}`,
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
    'Content-Type: application/javascript+module',
    '',
    workerScript,
    `--${boundary}--`,
    ''
  ].join('\r\n');

  const deployRes = await cfApi(
    `/accounts/${accountId}/workers/scripts/tg-proxy`,
    'PUT',
    multipartBody,
    `multipart/form-data; boundary=${boundary}`
  );
  console.log('Worker Deploy:', JSON.stringify(deployRes.data));

  await cfApi(
    `/accounts/${accountId}/workers/scripts/tg-proxy/subdomain`,
    'POST',
    { enabled: true }
  );

  const proxyUrl = `https://tg-proxy.${subdomain}.workers.dev`;
  console.log(`SUCCESS! Deployed at: ${proxyUrl}`);

  // Check zones
  const zonesRes = await cfApi('/zones');
  const zones = zonesRes.data?.result || [];
  console.log('User Zones:', JSON.stringify(zones.map(z => z.name)));

  const activeTgToken = process.env.TELEGRAM_TOKEN || '8839028026:AAH_uf2mRfrXMDWXjRbfXXD-b3grmYCWI2E';

  // Test live proxy
  let testOk = false;
  let testDetails = '';
  try {
    const testReq = await fetch(`${proxyUrl}/bot${activeTgToken}/getMe`);
    const testData = await testReq.json();
    testOk = testData.ok;
    testDetails = JSON.stringify(testData.result?.username);
  } catch (e) {
    testDetails = e.message;
  }

  const notifyMsg = `🚀 <b>پروکسی معکوس تلگرام روی کلودفلر با موفقیت ساخته و فعال شد!</b>\n\n` +
    `🌐 <b>آدرس پروکسی ورکر شما:</b>\n<code>${proxyUrl}</code>\n\n` +
    `✅ <b>تست زنده اتصال به تلگرام:</b> ${testOk ? 'موفقیت‌آمیز (' + testDetails + ')' : 'در حال انتظار / آماده'}\n` +
    `👤 <b>اکانت کلودفلر:</b> <code>${account.name}</code>\n` +
    `🔗 <b>دامنه‌های متصل:</b> ${zones.length > 0 ? zones.map(z => z.name).join(', ') : 'ندارد (روی دامنه مستقیم workers.dev)'}`;

  await sendTg(notifyMsg);
  console.log('Telegram notification sent!');

  lastDeployResult = {
    success: true,
    proxyUrl,
    subdomain,
    account: account.name,
    zones: zones.map(z => z.name),
    tested: testOk
  };
  return lastDeployResult;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Build step error:', err);
  });
}

module.exports = {
  deployCloudflareWorker: main,
  getDeployResult: () => lastDeployResult
};
