// НА СТРОКЕ 2 УКАЖИТЕ ССЫЛКУ, КОТОРУЮ ВАМ ВЫДАЛ GOOGLE APPS SCRIPT ПРИ ДЕПЛОЕ:
const API_URL = "https://script.google.com/macros/s/AKfycbyLFU7ceVKxS-L8kDjcJwKLZ-AAXXXzOICKNlTypxu_zopUcPtf_e90pzDi6xmbsDy7/exec"; 

let auditSession = { inspector: '', objectName: '', contractor: '', results: [] };
let finalViolationsText = "";

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => console.log("Офлайн-модуль активен"));
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
        const res = await response.json();
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
    res.objects.forEach(obj => objectSelect.add(new Option(obj.id + " | " + obj.name, obj.name)));
    res.contractors.forEach(contr => contractorSelect.add(new Option(contr, contr)));
    document.getElementById('setup-loading').style.display = 'none';
    document.getElementById('form-fields-wrapper').style.display = 'block';
}

async function startFullAudit() {
    const insp = document.getElementById('inspector').value.trim();
    const obj = document.getElementById('object-select').value;
    const contr = document.getElementById('contractor-select').value;
    if(!insp || !obj || !contr) return alert("Заполните форму первого шага!");
    
    auditSession.inspector = insp; auditSession.objectName = obj; auditSession.contractor = contr; auditSession.results = [];
    finalViolationsText = "";
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
    data.forEach(q => {
        const card = document.createElement('div');
        card.className = 'card'; card.id = 'q-box-' + q.id;
        card.innerHTML = `<div class="badge">${q.category}</div><p style="margin:5px 0 12px 0; font-size:16px; font-weight:600;">${q.question}</p>`;
        if(q.normative) card.innerHTML += `<div class="normative-text"><b>Норматив:</b> <span>${q.normative}</span></div>`;
        
        const btnRow = document.createElement('div'); btnRow.className = 'btn-row';
        btnRow.innerHTML = `<button type="button" class="btn btn-success" onclick="setResult(${q.id},'Соответствует','${q.question.replace(/'/g, "\\'")}','${q.category.replace(/'/g, "\\'")}','${q.normative ? q.normative.replace(/'/g, "\\'") : ''}')">Соответствует</button>
                            <button type="button" class="btn btn-danger" onclick="setResult(${q.id},'Нарушение','${q.question.replace(/'/g, "\\'")}','${q.category.replace(/'/g, "\\'")}','${q.normative ? q.normative.replace(/'/g, "\\'") : ''}')">Нарушение</button>`;
        card.appendChild(btnRow);
        card.innerHTML += `<input type="text" id="comment-${q.id}" class="comment-box" placeholder="Опишите детали нарушения...">`;
        container.appendChild(card);
    });
}

function setResult(id, status, question, category, normative) {
    let item = auditSession.results.find(r => r.id === id);
    if (!item) {
        item = { id: id, question: question, category: category, normative: normative, status: status, comment: '' };
        auditSession.results.push(item);
    } else { 
        item.status = status; 
    }
    const comp = document.getElementById('comment-' + id);
    if (comp) comp.style.display = status === 'Нарушение' ? 'block' : 'none';
    document.getElementById('q-box-' + id).style.borderLeftColor = status === 'Соответствует' ? 'var(--success)' : 'var(--danger)';
}

// ИСПРАВЛЕННЫЙ СБОР ВСЕХ НАРУШЕНИЙ БЕЗ ПОТЕРЬ
async function submitAuditWithOffline() {
    if (auditSession.results.length === 0) return alert("Вы не ответили ни на один вопрос!");
    
    const violations = [];
    
    // Безопасный сбор данных на основе ответов инспектора, а не сырого кэша
    auditSession.results.forEach(item => {
        if (item.status === 'Нарушение') {
            const inputField = document.getElementById('comment-' + item.id);
            const userComment = inputField ? inputField.value.trim() : "";
            const finalComment = userComment || "не расписано";
            
            let line = `• [${item.category}] ${item.question}`;
            if (item.normative) line += ` (Норматив: ${item.normative})`;
            line += `\n  Замечание: ${finalComment}`;
            
            violations.push(line);
        }
    });

    // Объединяем абсолютно ВСЕ найденные нарушения через двойной перенос строки
    finalViolationsText = violations.length > 0 ? violations.join("\n\n") : "Нарушений в ходе проверки не выявлено. Объект соответствует нормам ОТиПБ.";
    auditSession.aggregatedViolations = finalViolationsText;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    if (navigator.onLine) {
        btn.innerText = "⏳ Отправка в облако...";
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(auditSession), headers: { 'Content-Type': 'text/plain' } });
            btn.innerText = "✅ Успешно сохранено!";
            document.getElementById('pdf-btn').disabled = false;
            alert("Данные успешно занесены в Google Таблицу!");
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
    alert("⚠️ Нет связи. Акт надежно сохранен в памяти устройства и отправится в Google, как только появится сеть. Теперь вы можете нажать кнопку №2 и скачать полный PDF-акт.");
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
    alert("🔄 Обнаружен интернет: все накопленные офлайн-акты успешно переданы в Google Таблицу!");
}

// НАДЕЖНАЯ ГЕНЕРАЦИЯ PDF БЕЗ ОБРЕЗАНИЯ ДЛИННЫХ ТЕКСТОВЫХ БЛОКОВ
async function downloadChecklistPdf() {
    const btnPdf = document.getElementById('pdf-btn');
    btnPdf.disabled = true;
    btnPdf.innerText = "⏳ Сборка PDF...";

    const currentDateStr = new Date().toLocaleDateString('ru-RU');
    
    // Заполняем скрытую печатную форму на странице
    document.getElementById('p-date').textContent = currentDateStr;
    document.getElementById('p-inspector').textContent = auditSession.inspector;
    document.getElementById('p-object').textContent = auditSession.objectName;
    document.getElementById('p-contractor').textContent = auditSession.contractor;
    document.getElementById('p-violations').textContent = finalViolationsText;
    const printElement = document.getElementById('print-blank-zone');
    printElement.style.display = 'block'; // Временно включаем для рендеринга библиотеки
    const pdfOptions = {
        margin: 15,
        filename: 'Акт_ОТ_' + auditSession.objectName.replace(/[^a-zA-Z0-9а-яА-Я_]/g, "") + '' + currentDateStr + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } // Предотвращает обрезание строк на стыке страниц
            };
    
    try {
        await html2pdf().set(pdfOptions).from(printElement).save();
        printElement.style.display = 'none';
        btnPdf.innerText = "2. Скачать Акт в PDF 📄";
        btnPdf.disabled = false;

        if (confirm("Акт сохранен! Очистить форму для новой проверки?")) {
            location.reload();
        }
        } catch(err) {
        console.error(err);
        printElement.style.display = 'none';
        btnPdf.disabled = false;
        btnPdf.innerText = "2. Скачать Акт в PDF 📄";
        alert("Ошибка создания PDF. Попробуйте еще раз.");
    }
}

function backToStep1() { document.getElementById('step-3-checklist').style.display = 'none'; document.getElementById('step-1-form').style.display = 'block'; }
        
