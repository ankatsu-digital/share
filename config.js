// Apps ScriptをデプロイしてできたウェブアプリのURL(末尾は /exec)に書き換えてください
const GAS_URL = 'https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXX/exec';

// Apps Script側に呼び出す共通関数
async function callApi(action, params) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ action: action }, params))
  });
  return res.json();
}
