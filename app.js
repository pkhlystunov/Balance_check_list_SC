// НА СТРОКЕ 2 УКАЖИТЕ ССЫЛКУ, КОТОРУЮ ВАМ ВЫДАЛ GOOGLE APPS SCRIPT ПРИ ДЕПЛОЕ:
const API_URL = "https://script.google.com/macros/s/AKfycbyLFU7ceVKxS-L8kDjcJwKLZ-AAXXXzOICKNlTypxu_zopUcPtf_e90pzDi6xmbsDy7/exec"; 

let auditSession = { inspector: '', objectName: '', contractor: '', results: [] };
let finalViolationsText = "";

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(function() {
        console.log("Офлайн-модуль активен");
    });
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

function updateNetworkStatus() {
    const indicator = document.getElementById('net-indicator');
    if (navigator.onLine) {
        indicator.textContent = "🌐 Режим: Онлайн (Данные пишутся в облако)";
        indicator.className = "network-status online-mode";
        syncOfflineQueue();
    } else {
        indicator.textContent = "⚠️ Режим: Офлайн (Данные сохраняются на телефон)";
        indicator.className = "network-status offline-mode";
    }
}

document.addEventListener("DOMContentLoaded", async function() {
    updateNetworkStatus();
    try {
        const response = await fetch(API_URL + "?action=getSetupData", { method: "GET", redirect: "follow" });
        const rawText = await response.text();
        if (rawText.includes("Google Accounts") || rawText.includes("Sign in")) {
            throw new Error("Защита Google заблокировала анонимный доступ.");
        }
        const res = JSON.parse(rawText);
        if (res.success) {
            localStorage.setItem('cached_setup', JSON.stringify(res));
            populateSelects(res);
        }
    } catch (e) {
        const cached = localStorage.getItem('cached_setup');
        if (cached) {
            populateSelects(JSON.parse(cached));
        } else {
            document.getElementById('setup-loading').innerHTML = "<b style='color:red;'>Первый запуск требует интернет-соединения.</b>";
        }
    }
});

function populateSelects(res) {
    const objectSelect = document.getElementById('object-select');
    const contractorSelect = document.getElementById('contractor-select');
    objectSelect.innerHTML = '<option value="">-- Выберите объект --</option>';
    contractorSelect.innerHTML = '<option value="">-- Выберите подрядчика --</option>';
    res.objects.forEach(function(obj) {
        objectSelect.add(new Option(obj.id + " | " + obj.name, obj.name));
    });
    res.contractors.forEach(function(contr) {
        contractorSelect.add(new Option(contr, contr));
    });
    document.getElementById('setup-loading').style.display = 'none';
    document.getElementById('form-fields-wrapper').style.display = 'block';
}

async function startFullAudit() {
    const insp = document.getElementById('inspector').value.trim();
    const obj = document.getElementById('object-select').value;
    const contr = document.getElementById('contractor-select').value;
    if(!insp || !obj || !contr) return alert("Заполните форму первого шага!");
    
    auditSession.inspector = insp; 
    auditSession.objectName = obj; 
    auditSession.contractor = contr; 
    auditSession.results = [];
    
    document.getElementById('pdf-btn').disabled = true;
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-btn').innerText = "1. Сохранить Акт (В реестр) 💾";
    
    const container = document.getElementById('questions-container');
    container.innerHTML = "⏳ Загрузка вопросов чек-листа...";
    document.getElementById('step-3-checklist').style.display = 'block';
    document.getElementById('step-1-form').style.display = 'none';
    
    document.getElementById('audit-meta-insp').textContent = insp;
    document.getElementById('audit-meta-obj').textContent = obj;
    document.getElementById('audit-meta-contr').textContent = contr;
    document.getElementById('audit-meta-date').textContent = new Date().toLocaleDateString('ru-RU');

    try {
        const response = await fetch(API_URL + "?action=getChecklist", { method: "GET", redirect: "follow" });
        const result = await response.json();
        if (result.success) {
            localStorage.setItem('cached_checklist', JSON.stringify(result.data));
            renderChecklist(result.data);
        }
    } catch (e) {
        const cachedQuestions = localStorage.getItem('cached_checklist');
        if (cachedQuestions) {
            renderChecklist(JSON.parse(cachedQuestions));
        } else {
            container.innerHTML = "Ошибка: чек-лист отсутствует в памяти устройства.";
        }
    }
}

function renderChecklist(data) {
    const container = document.getElementById('questions-container');
    container.innerHTML = "";
    data.forEach(function(q) {
        const card = document.createElement('div');
        card.className = 'card'; 
        card.id = 'q-box-' + q.id;
        card.innerHTML = '<div class="badge">' + q.category + '</div><p style="margin:5px 0 12px 0; font-size:16px; font-weight:600;">' + q.question + '</p>';
        if(q.normative) {
            card.innerHTML += '<div class="normative-text"><b>Норматив:</b> <span>' + q.normative + '</span></div>';
        }
        
        const btnRow = document.createElement('div'); 
        btnRow.className = 'btn-row';
        
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'btn btn-success';
        okBtn.textContent = 'Соответствует';
        okBtn.onclick = function() { setResult(q.id, 'Соответствует', q.question, q.category, q.normative); };
        
        const failBtn = document.createElement('button');
        failBtn.type = 'button';
        failBtn.className = 'btn btn-danger';
        failBtn.textContent = 'Нарушение';
        failBtn.onclick = function() { setResult(q.id, 'Нарушение', q.question, q.category, q.normative); };
        
        btnRow.appendChild(okBtn);
        btnRow.appendChild(failBtn);
        card.appendChild(btnRow);
        
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'comment-' + q.id;
        inp.className = 'comment-box';
        inp.placeholder = 'Опишите детали нарушения...';
        card.appendChild(inp);
        
        container.appendChild(card);
    });
}
      function setResult(id, status, question, category, normative) {
    let item = auditSession.results.find(function(r) { return r.id === id; });
    if (!item) {
        item = { id: id, question: question, category: category, normative: normative, status: status, comment: '' };
        auditSession.results.push(item);
    } else { 
        item.status = status; 
    }
    const comp = document.getElementById('comment-' + id);
    if (comp) {
        comp.style.display = status === 'Нарушение' ? 'block' : 'none';
    }
    document.getElementById('q-box-' + id).style.borderLeftColor = status === 'Соответствует' ? 'var(--success)' : 'var(--danger)';
}

async function submitAuditWithOffline() {
    if (auditSession.results.length === 0) return alert("Вы не ответили ни на один вопрос!");
    
    const violations = [];
    
    auditSession.results.forEach(function(item) {
        const inputField = document.getElementById('comment-' + item.id);
        if (inputField) {
            item.comment = inputField.value.trim() || "не расписано";
        }
        
        if (item.status === 'Нарушение') {
            let line = '• [' + item.category + '] ' + item.question;
            if (item.normative) line += ' (Норматив: ' + item.normative + ')';
            line += '\n  Замечание: ' + item.comment;
            violations.push(line);
        }
    });

    auditSession.aggregatedViolations = violations.length > 0 ? violations.join("\n\n") : "Нарушений в ходе проверки не выявлено.";

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    if (navigator.onLine) {
        btn.innerText = "⏳ Отправка в облако...";
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(auditSession), headers: { 'Content-Type': 'text/plain' } });
            btn.innerText = "✅ Успешно сохранено!";
            document.getElementById('pdf-btn').disabled = false;
            alert("Данные успешно сохранены в Google Реестр!");
        } catch (e) {
            saveToOfflineQueue(auditSession);
        }
    } else {
        saveToOfflineQueue(auditSession);
    }
}

function saveToOfflineQueue(session) {
    const queue = JSON.parse(localStorage.getItem('offline_audit_queue') || '[]');
    queue.push(session);
    localStorage.setItem('offline_audit_queue', JSON.stringify(queue));
    
    const btn = document.getElementById('submit-btn');
    btn.innerText = "💾 Сохранено офлайн!";
    document.getElementById('pdf-btn').disabled = false;
    alert("⚠️ Нет связи. Акт надежно сохранен в памяти устройства. Вы можете нажать кнопку №2 и скачать PDF-акт.");
}

async function syncOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem('offline_audit_queue') || '[]');
    if (queue.length === 0) return;
    for (let i = 0; i < queue.length; i++) {
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(queue[i]), headers: { 'Content-Type': 'text/plain' } });
        } catch (e) { return; }
    }
    localStorage.removeItem('offline_audit_queue');
    alert("🔄 Обнаружен интернет: сохраненные офлайн-акты переданы в Google Таблицу!");
}

async function downloadChecklistPdf() {
    const btnPdf = document.getElementById('pdf-btn');
    btnPdf.disabled = true;
    btnPdf.innerText = "⏳ Сборка PDF...";

    const currentDateStr = new Date().toLocaleDateString('ru-RU');
    
    document.getElementById('p-date').textContent = currentDateStr;
    document.getElementById('p-inspector').textContent = auditSession.inspector;
    document.getElementById('p-object').textContent = auditSession.objectName;
    document.getElementById('p-contractor').textContent = auditSession.contractor;
    
    const tbody = document.getElementById('p-violations-tbody');
    tbody.innerHTML = ""; 
    
    const violationsOnly = auditSession.results.filter(function(r) { return r.status === 'Нарушение'; });
    
    if (violationsOnly.length === 0) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 4;
        cell.style.padding = "12px";
        cell.style.textAlign = "center";
        cell.style.color = "#27ae60";
        cell.style.fontWeight = "bold";
        cell.textContent = "Нарушений в ходе проверки не выявлено. Объект соответствует нормам ОТиПБ.";
    } else {
        violationsOnly.forEach(function(item, index) {
            const row = tbody.insertRow();
            
            const cNum = row.insertCell();
            cNum.style.border = "1px solid #ddd";
            cNum.style.padding = "8px";
            cNum.style.textAlign = "center";
            cNum.textContent = index + 1;
            
            const cCat = row.insertCell();
            cCat.style.border = "1px solid #ddd";
            cCat.style.padding = "8px";
            cCat.style.fontWeight = "bold";
            cCat.style.fontSize = "13px";
            cCat.textContent = "[" + item.category + "]";
            
            const cQuest = row.insertCell();
            cQuest.style.border = "1px solid #ddd";
            cQuest.style.padding = "8px";
            cQuest.style.fontSize = "13px";
            
            if (item.normative) {
                cQuest.textContent = item.question + " (Норматив: " + item.normative + ")";
            } else {
                cQuest.textContent = item.question;
            }
            
            const cComm = row.insertCell();
            cComm.style.border = "1px solid #ddd";
            cComm.style.padding = "8px";
            cComm.style.fontSize = "13px";
            cComm.style.color = "#b33939";
            cComm.style.backgroundColor = "#fdf2f2";
            cComm.textContent = item.comment;
        });
    }

    const printElement = document.getElementById('print-blank-zone');
    printElement.style.display = 'block';

    const pdfOptions = {
        margin: 10,
        filename: 'Акт_ОТ_' + auditSession.objectName.replace(/[^a-zA-Z0-9а-яА-Я_]/g, "_") + '_' + currentDateStr + '.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 1.5, useCORS: true, logging: false }, 
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
        await html2pdf().set(pdfOptions).from(printElement).save();
        printElement.style.display = 'none';
        btnPdf.innerText = "2. Скачать Акт в PDF 📄";
        btnPdf.disabled = false;
        
        if (confirm("Акт сохранен на ваше устройство! Очистить форму для новой проверки?")) {
            location.reload();
        }
    } catch(err) {
        console.error("Ошибка html2pdf:", err);
        printElement.style.display = 'none';
        btnPdf.disabled = false;
        btnPdf.innerText = "2. Скачать Акт в PDF 📄";
        alert("Произошел сбой сборки PDF на мобильном устройстве.");
    }
}

function backToStep1() { 
    document.getElementById('step-3-checklist').style.display = 'none'; 
    document.getElementById('step-1-form').style.display = 'block'; 
}
    
