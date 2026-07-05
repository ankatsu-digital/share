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
    } else {
      showMsg(document.getElementById('loginMsg'), res.message || 'パスワードが違います', 'error');
    }
  } catch (e) {
    showMsg(document.getElementById('loginMsg'), '通信エラー: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

async function loadDefaultTemplate() {
  const res = await callApi('getDefaultTemplate', { password: adminPassword });
  if (res.ok) document.getElementById('emailTemplate').value = res.template;
}

async function loadMailSettings() {
  const res = await callApi('getMailSettings', { password: adminPassword });
  if (res.ok) document.getElementById('replyToInput').value = res.replyTo || '';
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

document.getElementById('uploadBtn').addEventListener('click', () => {
  const fileInput = document.getElementById('file');
  const recipientEmail = document.getElementById('recipientEmail').value.trim();
  const customId = document.getElementById('customId').value.trim();
  const maxDownloads = document.getElementById('maxDownloads').value;
  const expiresInHours = document.getElementById('expiresInHours').value;
  const emailTemplate = document.getElementById('emailTemplate').value;
  const uploadMsg = document.getElementById('uploadMsg');
  const btn = document.getElementById('uploadBtn');

  if (!fileInput.files.length) { showMsg(uploadMsg, 'ファイルを選択してください', 'error'); return; }
  if (!recipientEmail) { showMsg(uploadMsg, '受信者のメールアドレスを入力してください', 'error'); return; }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async () => {
    const base64Data = reader.result;
    btn.disabled = true;
    showMsg(uploadMsg, 'アップロード中...(ファイルが大きいと時間がかかります)', 'info');

    try {
      const res = await callApi('uploadTransfer', {
        password: adminPassword,
        base64Data, fileName: file.name, recipientEmail,
        emailTemplate, maxDownloads, expiresInHours, customId
      });
      if (res.ok) {
        document.getElementById('shareLink').value = res.shareLink;
        document.getElementById('resultBox').style.display = 'block';
        showMsg(uploadMsg, '送信完了。相手にリンクのメールが届きます。', 'success');
        refreshPending();
        refreshHistory();
      } else {
        showMsg(uploadMsg, res.message || 'アップロードに失敗しました', 'error');
      }
    } catch (e) {
      showMsg(uploadMsg, '通信エラー: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };
  reader.readAsDataURL(file);
});

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

      div.innerHTML = `
        <div class="meta">
          <strong>${item.recipientEmail}</strong><br>
          ${item.fileName}<br>
          ${created.toLocaleString('ja-JP')} ・ DL ${item.downloadCount}/${item.maxDownloads}
          <span class="status-badge ${badgeClass}">${item.status}</span>
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
