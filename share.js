const params = new URLSearchParams(location.search);
const transferId = params.get('id');

const loadingCard = document.getElementById('loadingCard');
const loadingText = document.getElementById('loadingText');
const mainCard = document.getElementById('mainCard');
const successCard = document.getElementById('successCard');
const mainMsg = document.getElementById('mainMsg');
const statusText = document.getElementById('statusText');
const infoBox = document.getElementById('infoBox');

let cachedLoginId = '';
let cachedPassword = '';
let cachedFiles = [];
let hasConsumedDownload = false;
let statusPollTimer = null;

function showMsg(el, text, type) {
  el.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

function fmtDateTime(iso) {
  try { return new Date(iso).toLocaleString('ja-JP'); } catch (e) { return iso; }
}

function renderInfoBox(data) {
  const rows = [];
  if (data.senderName) {
    rows.push(`<div class="row"><span class="k">送信者</span><span class="v">${escapeHtml(data.senderName)}さん</span></div>`);
  }
  if (typeof data.fileCount === 'number') {
    rows.push(`<div class="row"><span class="k">ファイル数</span><span class="v">${data.fileCount}件</span></div>`);
  }
  rows.push(`<div class="row"><span class="k">ダウンロード期限</span><span class="v">${data.expiresAt ? fmtDateTime(data.expiresAt) : '無期限'}</span></div>`);
  infoBox.innerHTML = rows.join('');
  document.getElementById('shareSubtitle').textContent = data.senderName
    ? `${data.senderName}さんからファイルが共有されています。`
    : 'ファイルが共有されています。';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadStatus(isInitial) {
  if (!transferId) {
    loadingText.textContent = 'リンクが正しくありません';
    return;
  }

  try {
    const res = await callApi('getLoginId', { id: transferId });
    if (!res.ok) {
      loadingCard.querySelector('.loading-screen').innerHTML = `<p class="msg error" style="width:100%;">${res.message}</p>`;
      mainCard.style.display = 'none';
      if (statusPollTimer) clearInterval(statusPollTimer);
      return;
    }

    if (isInitial) {
      loadingCard.style.display = 'none';
      mainCard.style.display = 'block';
    }

    renderInfoBox(res);

    if (res.authMode === 'link_only') {
      document.getElementById('idPasswordSection').style.display = 'none';
      document.getElementById('linkOnlySection').style.display = 'block';
      if (statusPollTimer) clearInterval(statusPollTimer);
    } else {
      document.getElementById('loginIdDisplay').textContent = res.loginId;
      statusText.textContent = res.passwordSent
        ? 'パスワードは送信済みです。メールをご確認ください。'
        : 'パスワードは自動で送信される予定です(届くまで少しお待ちください)。';
    }
  } catch (e) {
    if (isInitial) {
      loadingText.textContent = '通信エラー: ' + e.message;
    }
  }
}

loadStatus(true);
statusPollTimer = setInterval(() => loadStatus(false), 30000);

document.getElementById('verifyBtn').addEventListener('click', async () => {
  const loginId = document.getElementById('inputLoginId').value.trim();
  const password = document.getElementById('inputPassword').value;
  const btn = document.getElementById('verifyBtn');
  const label = document.getElementById('verifyBtnLabel');

  btn.disabled = true;
  label.innerHTML = '<span class="progress-inline"><span class="mini-spinner"></span>認証中...</span>';
  mainMsg.innerHTML = '';

  try {
    const res = await callApi('verifyAndGetFile', { id: transferId, loginId, password });
    if (!res.ok) {
      showMsg(mainMsg, res.message, 'error');
      btn.disabled = false;
      label.textContent = '確認する';
      return;
    }

    cachedLoginId = loginId;
    cachedPassword = password;
    cachedFiles = res.files || [];

    if (statusPollTimer) clearInterval(statusPollTimer);

    mainCard.style.display = 'none';
    successCard.style.display = 'block';
    renderSuccessScreen(res);
  } catch (e) {
    showMsg(mainMsg, '通信エラー: ' + e.message, 'error');
    btn.disabled = false;
    label.textContent = '確認する';
  }
});

document.getElementById('linkOnlyBtn').addEventListener('click', async () => {
  const btn = document.getElementById('linkOnlyBtn');
  const label = document.getElementById('linkOnlyBtnLabel');
  btn.disabled = true;
  label.innerHTML = '<span class="progress-inline"><span class="mini-spinner"></span>準備中...</span>';
  mainMsg.innerHTML = '';

  try {
    const res = await callApi('verifyAndGetFile', { id: transferId, loginId: '', password: '' });
    if (!res.ok) {
      showMsg(mainMsg, res.message, 'error');
      btn.disabled = false;
      label.textContent = 'ダウンロードの準備をする';
      return;
    }

    cachedLoginId = '';
    cachedPassword = '';
    cachedFiles = res.files || [];

    if (statusPollTimer) clearInterval(statusPollTimer);

    mainCard.style.display = 'none';
    successCard.style.display = 'block';
    renderSuccessScreen(res);
  } catch (e) {
    showMsg(mainMsg, '通信エラー: ' + e.message, 'error');
    btn.disabled = false;
    label.textContent = 'ダウンロードの準備をする';
  }
});

function renderSuccessScreen(res) {
  const remainingLabel = (res.remaining === null || typeof res.remaining === 'undefined')
    ? '無制限'
    : `${res.remaining}回`;
  document.getElementById('remainingText').textContent =
    `残りダウンロード可能回数: ${remainingLabel}` +
    ` ・ 期限: ${res.expiresAt ? fmtDateTime(res.expiresAt) : '無期限'}`;

  const fileList = document.getElementById('fileList');
  fileList.innerHTML = '';
  cachedFiles.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `<span class="name">${escapeHtml(f.fileName)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'ダウンロード';
    btn.addEventListener('click', () => downloadSingle(idx));
    div.appendChild(btn);
    fileList.appendChild(div);
  });

  const allBtn = document.getElementById('downloadAllBtn');
  if (cachedFiles.length > 1) {
    allBtn.style.display = 'block';
    allBtn.onclick = downloadAllAsZip;
  } else {
    allBtn.style.display = 'none';
  }
}

async function ensureConsumed() {
  if (hasConsumedDownload) return true;
  const r = await callApi('confirmDownload', { id: transferId, loginId: cachedLoginId, password: cachedPassword });
  if (!r.ok) {
    showMsg(document.getElementById('downloadMsg'), r.message, 'error');
    return false;
  }
  hasConsumedDownload = true;
  return true;
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadSingle(idx) {
  const ok = await ensureConsumed();
  if (!ok) return;
  const f = cachedFiles[idx];
  const blob = base64ToBlob(f.base64, f.mimeType);
  triggerBlobDownload(blob, f.fileName);
}

async function downloadAllAsZip() {
  const ok = await ensureConsumed();
  if (!ok) return;
  const msg = document.getElementById('downloadMsg');
  showMsg(msg, 'ZIPを作成しています...', 'info');
  try {
    const zip = new JSZip();
    cachedFiles.forEach((f) => {
      zip.file(f.fileName, f.base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const today = new Date().toISOString().slice(0, 10);
    triggerBlobDownload(blob, `files_${today}.zip`);
    msg.innerHTML = '';
  } catch (e) {
    showMsg(msg, 'ZIP作成エラー: ' + e.message, 'error');
  }
}
