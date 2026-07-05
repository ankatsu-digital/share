let adminPassword = '';

function showMsg(el, text, type) {
  el.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const pw = document.getElementById('adminPw').value;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  try {
    const res = await callApi('checkAdminPassword', { password: pw });
    if (res.ok) {
      adminPassword = pw;
      document.getElementById('loginCard').style.display = 'none';
      document.getElementById('uploadCard').style.display = 'block';
      document.getElementById('pendingCard').style.display = 'block';
      loadDefaultTemplate();
      refreshPending();
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

document.getElementById('uploadBtn').addEventListener('click', () => {
  const fileInput = document.getElementById('file');
  const recipientEmail = document.getElementById('recipientEmail').value.trim();
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
        emailTemplate, maxDownloads, expiresInHours
      });
      if (res.ok) {
        document.getElementById('shareLink').value = res.shareLink;
        document.getElementById('resultBox').style.display = 'block';
        showMsg(uploadMsg, '送信完了。相手にリンクのメールが届きます。', 'success');
        refreshPending();
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
      div.className = 'pending-item';
      const sendTime = new Date(item.scheduledSendAt);
      div.innerHTML = `
        <div class="meta">${item.recipientEmail} / ${item.fileName}<br>送信予定: ${sendTime.toLocaleTimeString('ja-JP')}</div>
        <button data-id="${item.id}">キャンセル</button>`;
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
