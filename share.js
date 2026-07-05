const params = new URLSearchParams(location.search);
const transferId = params.get('id');

const loadingMsg = document.getElementById('loadingMsg');
const content = document.getElementById('content');
const mainMsg = document.getElementById('mainMsg');
const statusText = document.getElementById('statusText');

let cachedLoginId = '';
let cachedPassword = '';
let cachedFile = null;

function showMsg(text, type) {
  mainMsg.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

async function loadStatus() {
  if (!transferId) { loadingMsg.textContent = 'リンクが正しくありません'; return; }

  try {
    const res = await callApi('getLoginId', { id: transferId });
    if (!res.ok) {
      loadingMsg.textContent = res.message;
      content.style.display = 'none';
      return;
    }
    loadingMsg.style.display = 'none';
    content.style.display = 'block';
    document.getElementById('loginIdDisplay').textContent = res.loginId;
    statusText.textContent = res.passwordSent
      ? 'パスワードは送信済みです。メールをご確認ください。'
      : 'パスワードは自動で送信される予定です(届くまで少しお待ちください)。';
  } catch (e) {
    loadingMsg.textContent = '通信エラー: ' + e.message;
  }
}

loadStatus();
setInterval(loadStatus, 30000);

document.getElementById('verifyBtn').addEventListener('click', async () => {
  const loginId = document.getElementById('inputLoginId').value.trim();
  const password = document.getElementById('inputPassword').value;
  const btn = document.getElementById('verifyBtn');
  btn.disabled = true;

  try {
    const res = await callApi('verifyAndGetFile', { id: transferId, loginId, password });
    if (!res.ok) { showMsg(res.message, 'error'); return; }

    cachedLoginId = loginId;
    cachedPassword = password;
    cachedFile = res;

    showMsg('認証成功。残りダウンロード可能回数: ' + res.remaining + '回', 'success');

    const area = document.getElementById('downloadArea');
    area.innerHTML = '';
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'download-btn';
    a.textContent = 'ファイルをダウンロード: ' + res.fileName;
    a.addEventListener('click', (ev) => { ev.preventDefault(); doDownload(); });
    area.appendChild(a);
  } catch (e) {
    showMsg('通信エラー: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

async function doDownload() {
  if (!cachedFile) return;
  try {
    const res = await callApi('confirmDownload', { id: transferId, loginId: cachedLoginId, password: cachedPassword });
    if (!res.ok) { showMsg(res.message, 'error'); return; }

    const byteChars = atob(cachedFile.base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: cachedFile.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cachedFile.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    showMsg('通信エラー: ' + e.message, 'error');
  }
}
