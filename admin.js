let adminPassword = '';

function showMsg(el, text, type) {
  el.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  const pw = document.getElementById('adminPw').value;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  try {
    const res = await callApi('checkAdminPassword', { password: pw });
    if (res.ok) {
      adminPassword = pw;
      document.getElementById('loginCard').style.display = 'none';
      document.getElementById('mainArea').style.display = 'block';
      loadDefaultTemplate();
      loadMailSettings();
      refreshPending();
      refreshHistory();
      refreshRequests();
    } else {
      showMsg(document.getElementById('loginMsg'), res.message || 'パスワードが違います', 'error');
    }
  } catch (e) {
    showMsg(document.getElementById('loginMsg'), '通信エラー: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

let defaultTemplates = { id_password: { template: '', subject: '' }, link_only: { template: '', subject: '' } };
let defaultPasswordEmail = { subject: '', body: '' };

async function loadDefaultTemplate() {
  const res = await callApi('getDefaultTemplate', { password: adminPassword });
  if (res.ok) {
    defaultTemplates.id_password = { template: res.template, subject: res.subject };
    defaultTemplates.link_only = { template: res.templateLinkOnly, subject: res.subjectLinkOnly };
    defaultPasswordEmail = { subject: res.passwordEmailSubject, body: res.passwordEmailBody };
    document.getElementById('passwordEmailSubject').value = defaultPasswordEmail.subject;
    document.getElementById('passwordEmailBody').value = defaultPasswordEmail.body;
    applyTemplateForMode(document.getElementById('authMode').value);
  }
}

function applyTemplateForMode(mode) {
  const d = defaultTemplates[mode] || defaultTemplates.id_password;
  document.getElementById('emailTemplate').value = d.template;
  document.getElementById('emailSubject').value = d.subject;
}

document.getElementById('authMode').addEventListener('change', (ev) => {
  const mode = ev.target.value;
  const showIdPasswordExtras = mode !== 'link_only';
  document.getElementById('customPasswordRow').style.display = showIdPasswordExtras ? 'block' : 'none';
  document.getElementById('passwordEmailRow').style.display = showIdPasswordExtras ? 'block' : 'none';
  applyTemplateForMode(mode);
});

document.getElementById('unlimitedDownloads').addEventListener('change', (ev) => {
  document.getElementById('maxDownloads').disabled = ev.target.checked;
});

async function loadMailSettings() {
  const res = await callApi('getMailSettings', { password: adminPassword });
  if (res.ok) {
    document.getElementById('replyToInput').value = res.replyTo || '';
    const aliasRow = document.getElementById('aliasRow');
    if (res.hasAlias) {
      aliasRow.style.display = 'flex';
    } else {
      aliasRow.style.display = 'none';
      document.getElementById('useAlias').checked = false;
    }
  }
}

document.getElementById('saveMailSettingsBtn').addEventListener('click', async () => {
  const replyTo = document.getElementById('replyToInput').value.trim();
  const msg = document.getElementById('mailSettingsMsg');
  const btn = document.getElementById('saveMailSettingsBtn');
  btn.disabled = true;
  try {
    const res = await callApi('setMailSettings', { password: adminPassword, replyTo });
    if (res.ok) {
      showMsg(msg, '保存しました', 'success');
    } else {
      showMsg(msg, res.message || '保存に失敗しました', 'error');
    }
  } catch (e) {
    showMsg(msg, '通信エラー: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

const UPLOAD_CONCURRENCY = 3;

function setProgress(done, total) {
  const outer = document.getElementById('progressOuter');
  const inner = document.getElementById('progressInner');
  const label = document.getElementById('progressLabel');
  if (total <= 0) {
    outer.style.display = 'none';
    label.style.display = 'none';
    return;
  }
  outer.style.display = 'block';
  label.style.display = 'block';
  const pct = Math.round((done / total) * 100);
  inner.style.width = pct + '%';
  label.textContent = `アップロード中... ${done}/${total}件完了(${pct}%)`;
}

// 並列数を制限しつつ、配列の各要素に対して非同期処理を実行する
async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  let hasError = null;
  async function runNext() {
    while (index < items.length && !hasError) {
      const myIndex = index++;
      try {
        await worker(items[myIndex], myIndex);
      } catch (e) {
        hasError = e;
      }
    }
  }
  const runners = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) runners.push(runNext());
  await Promise.all(runners);
  if (hasError) throw hasError;
}

document.getElementById('uploadBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('file');
  const recipientEmail = document.getElementById('recipientEmail').value.trim();
  const senderName = document.getElementById('senderName').value.trim();
  const customId = document.getElementById('customId').value.trim();
  const authMode = document.getElementById('authMode').value;
  const customPassword = authMode === 'link_only' ? '' : document.getElementById('customPassword').value.trim();
  const unlimitedDownloads = document.getElementById('unlimitedDownloads').checked;
  const maxDownloads = unlimitedDownloads ? '' : document.getElementById('maxDownloads').value;
  const passwordEmailSubject = authMode === 'link_only' ? '' : document.getElementById('passwordEmailSubject').value.trim();
  const passwordEmailBody = authMode === 'link_only' ? '' : document.getElementById('passwordEmailBody').value;
  const expiresInHours = document.getElementById('expiresInHours').value;
  const emailSubject = document.getElementById('emailSubject').value.trim();
  const emailTemplate = document.getElementById('emailTemplate').value;
  const useAliasEl = document.getElementById('useAlias');
  const useAlias = useAliasEl ? useAliasEl.checked : false;
  const uploadMsg = document.getElementById('uploadMsg');
  const btn = document.getElementById('uploadBtn');

  if (!fileInput.files.length) { showMsg(uploadMsg, 'ファイルを選択してください', 'error'); return; }
  if (!recipientEmail) { showMsg(uploadMsg, '受信者のメールアドレスを入力してください', 'error'); return; }

  const files = Array.from(fileInput.files);
  btn.disabled = true;
  uploadMsg.innerHTML = '';
  setProgress(0, files.length);

  try {
    // ステップ1: 送信の枠を先に作る
    const draftRes = await callApi('createTransferDraft', {
      password: adminPassword,
      recipientEmail, emailTemplate, maxDownloads, expiresInHours, customId,
      useAlias, emailSubject, customPassword, senderName, authMode,
      passwordEmailSubject, passwordEmailBody
    });
    if (!draftRes.ok) {
      showMsg(uploadMsg, draftRes.message || '送信枠の作成に失敗しました', 'error');
      setProgress(0, 0);
      return;
    }
    const transferId = draftRes.transferId;

    // ステップ2: ファイルを並列で追加(完了ごとに進捗更新)
    let doneCount = 0;
    await runWithConcurrency(files, UPLOAD_CONCURRENCY, async (f) => {
      const base64Data = await readAsDataURL(f);
      const res = await callApi('addFileToTransfer', {
        password: adminPassword,
        transferId,
        file: { fileName: f.name, base64Data }
      });
      if (!res.ok) throw new Error(res.message || `${f.name} のアップロードに失敗しました`);
      doneCount++;
      setProgress(doneCount, files.length);
    });

    // ステップ3: 確定(通知メール送信)
    document.getElementById('progressLabel').textContent = '送信を確定しています...';
    const finalRes = await callApi('finalizeTransfer', { password: adminPassword, transferId });
    if (!finalRes.ok) {
      showMsg(uploadMsg, finalRes.message || '確定処理に失敗しました', 'error');
      return;
    }
    document.getElementById('shareLink').value = finalRes.shareLink;
    document.getElementById('resultBox').style.display = 'block';
    showMsg(uploadMsg, '送信完了。相手にリンクのメールが届きます。', 'success');
    refreshPending();
    refreshHistory();
  } catch (e) {
    showMsg(uploadMsg, 'エラー: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    setTimeout(() => setProgress(0, 0), 1500);
  }
});

function readAsDataURL(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBlob);
  });
}

async function refreshPending() {
  const list = document.getElementById('pendingList');
  try {
    const res = await callApi('getPendingSends', { password: adminPassword });
    if (!res.ok) { list.innerHTML = `<div class="empty">${res.message}</div>`; return; }
    if (!res.list.length) { list.innerHTML = '<div class="empty">現在、送信待ちはありません</div>'; return; }

    list.innerHTML = '';
    res.list.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      const sendTime = new Date(item.scheduledSendAt);
      div.innerHTML = `
        <div class="meta"><strong>${item.recipientEmail}</strong><br>${item.fileName}<br>送信予定: ${sendTime.toLocaleTimeString('ja-JP')}</div>
        <div class="actions"><button data-id="${item.id}">キャンセル</button></div>`;
      div.querySelector('button').addEventListener('click', async (ev) => {
        ev.target.disabled = true;
        const r = await callApi('cancelPendingSend', { id: item.id, password: adminPassword });
        if (!r.ok) alert(r.message);
        refreshPending();
      });
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty">通信エラー: ${e.message}</div>`;
  }
}

document.getElementById('refreshPendingBtn').addEventListener('click', refreshPending);

const STATUS_CLASS = {
  '有効': 'active',
  '無効化済み': 'muted',
  'キャンセル済み': 'muted',
  '期限切れ': 'muted',
  'ダウンロード上限到達': 'muted'
};

async function refreshHistory() {
  const list = document.getElementById('historyList');
  try {
    const res = await callApi('getHistory', { password: adminPassword });
    if (!res.ok) { list.innerHTML = `<div class="empty">${res.message}</div>`; return; }
    if (!res.list.length) { list.innerHTML = '<div class="empty">まだ送信履歴がありません</div>'; return; }

    list.innerHTML = '';
    res.list.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      const created = new Date(item.createdAt);
      const badgeClass = STATUS_CLASS[item.status] || 'active';
      const canDisable = item.status === '有効';

      const authModeLabel = item.authMode === 'link_only' ? 'リンクのみ' : 'ID・PW認証';
      const maxDlLabel = item.maxDownloads === null ? '無制限' : item.maxDownloads;
      const expiresLabel = item.expiresAt ? new Date(item.expiresAt).toLocaleString('ja-JP') : '無期限';
      const reqBadge = item.reactivationRequested ? '<span class="reason-badge">再有効化リクエスト有</span>' : '';
      div.innerHTML = `
        <div class="meta">
          <strong>${item.recipientEmail}</strong><br>
          ${item.fileName}<br>
          ${created.toLocaleString('ja-JP')} ・ DL ${item.downloadCount}/${maxDlLabel} ・ 期限: ${expiresLabel} ・ ${authModeLabel}
          <span class="status-badge ${badgeClass}">${item.status}</span>${reqBadge}
        </div>
        ${canDisable ? `<div class="actions"><button data-id="${item.id}">無効化</button></div>` : ''}
      `;
      const disableBtn = div.querySelector('button');
      if (disableBtn) {
        disableBtn.addEventListener('click', async (ev) => {
          if (!confirm('このリンクを無効化しますか?元に戻せません。')) return;
          ev.target.disabled = true;
          const r = await callApi('disableTransfer', { id: item.id, password: adminPassword });
          if (!r.ok) alert(r.message);
          refreshHistory();
        });
      }
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty">通信エラー: ${e.message}</div>`;
  }
}

document.getElementById('refreshHistoryBtn').addEventListener('click', refreshHistory);

const REASON_LABEL = { expired: '期限切れ', max_downloads: 'ダウンロード上限到達' };

async function refreshRequests() {
  const list = document.getElementById('requestsList');
  try {
    const res = await callApi('getReactivationRequests', { password: adminPassword });
    if (!res.ok) { list.innerHTML = `<div class="empty">${res.message}</div>`; return; }
    if (!res.list.length) { list.innerHTML = '<div class="empty">現在、リクエストはありません</div>'; return; }

    list.innerHTML = '';
    res.list.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      const requestedAt = new Date(item.requestedAt);
      const reasonLabel = REASON_LABEL[item.reason] || item.reason;
      const currentExpiresLabel = item.currentExpiresAt ? new Date(item.currentExpiresAt).toLocaleString('ja-JP') : '無期限';
      const currentMaxLabel = item.currentMaxDownloads === null ? '無制限' : `${item.currentDownloadCount}/${item.currentMaxDownloads}`;

      div.innerHTML = `
        <div class="meta">
          <strong>${item.recipientEmail}</strong> <span class="reason-badge">${reasonLabel}</span><br>
          ${item.fileName}<br>
          リクエスト日時: ${requestedAt.toLocaleString('ja-JP')}<br>
          現在の期限: ${currentExpiresLabel} ・ 現在のDL: ${currentMaxLabel}
          ${item.message ? `<br>メッセージ: ${item.message}` : ''}
        </div>
        <div class="request-controls">
          <div>
            <label>新しい有効期限</label>
            <select class="reqExpires">
              <option value="">変更しない</option>
              <option value="1">1時間後まで延長</option>
              <option value="24" selected>24時間後まで延長</option>
              <option value="72">3日後まで延長</option>
              <option value="168">7日後まで延長</option>
              <option value="unlimited">無期限にする</option>
            </select>
          </div>
          <div>
            <label>ダウンロード回数を追加</label>
            <input type="number" class="reqAddDl" value="1" min="0">
          </div>
          <div class="actions">
            <button class="approveBtn" style="background:var(--success);">有効化する</button>
            <button class="rejectBtn">却下する</button>
          </div>
        </div>
      `;

      div.querySelector('.approveBtn').addEventListener('click', async (ev) => {
        ev.target.disabled = true;
        const newExpiresInHours = div.querySelector('.reqExpires').value;
        const addDownloads = div.querySelector('.reqAddDl').value;
        const r = await callApi('approveReactivation', {
          password: adminPassword, id: item.id, newExpiresInHours, addDownloads
        });
        if (!r.ok) { alert(r.message); ev.target.disabled = false; return; }
        refreshRequests();
        refreshHistory();
      });

      div.querySelector('.rejectBtn').addEventListener('click', async (ev) => {
        if (!confirm('このリクエストを却下しますか?')) return;
        ev.target.disabled = true;
        const r = await callApi('rejectReactivation', { password: adminPassword, id: item.id });
        if (!r.ok) { alert(r.message); ev.target.disabled = false; return; }
        refreshRequests();
        refreshHistory();
      });

      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty">通信エラー: ${e.message}</div>`;
  }
}

document.getElementById('refreshRequestsBtn').addEventListener('click', refreshRequests);
