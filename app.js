// НА СТРОКЕ 2 УКАЖИТЕ ССЫЛКУ, КОТОРУЮ ВАМ ВЫДАЛ GOOGLE APPS SCRIPT ПРИ ДЕПЛОЕ:
const API_URL = "https://script.google.com/macros/s/AKfycbyLFU7ceVKxS-L8kDjcJwKLZ-AAXXXzOICKNlTypxu_zopUcPtf_e90pzDi6xmbsDy7/exec"; 

let auditSession = { inspector: '', objectName: '', contractor: '', results: [] };
let finalViolationsText = "";

// Регистрация офлайн-сервиса (Service Worker)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => console.log("Офлайн-модуль активен"));
}

// Мониторинг сети в реальном времени
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

function updateNetworkStatus() {
    const indicator = document.getElementById('net-indicator');
    if (navigator.onLine) {
        indicator.textContent = "🌐 Режим: Онлайн (Данные пишутся в облако)";
        indicator.className = "network-status online-mode";
        syncOfflineQueue(); // Автоматически выгружаем накопленные акты
    } else {
        indicator.textContent = "⚠️ Режим: Офлайн (Данные сохраняются на телефон)";
        indicator.className = "network-status offline-mode";
    }
}

document.addEventListener("DOMContentLoaded", async function() {
    updateNetworkStatus();
    const objectSelect = document.getElementById('object-select');
    const contractorSelect = document.getElementById('contractor-select');
    
    try {
        // Если интернет есть — обновляем локальные справочники свежими данными
        const response = await fetch(API_URL + "?action=getSetupData", { method: "GET", redirect: "follow" });
        const res = await response.json();
        
        if (res.success) {
            localStorage.setItem('cached_setup', JSON.stringify(res));
            populateSelects(res);
        }
    } catch (e) {
        // Если интернета нет — достаем списки объектов и подрядчиков из памяти телефона!
        const cached = localStorage.getItem('cached_setup');
        if (cached) {
            populateSelects(JSON.parse(cached));
            document.getElementById('setup-loading').style.display = 'none';
            document.getElementById('form-fields-wrapper').style.display = 'block';
        } else {
            document.getElementById('setup-loading').innerHTML = "<b style='color:red;'>Вы открыли приложение первый раз офлайн. Нужен интернет для начальной загрузки справочников.</b>";
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
    
    if(!insp || !obj || !contr) return alert("Заполните форму!");
    
    auditSession.inspector = insp; auditSession.objectName = obj; auditSession.contractor = contr; auditSession.results = [];
    document.getElementById('pdf-btn').disabled = true;
    document.getElementById('submit-btn').disabled = false;
    
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
        // Офлайн-загрузка критериев проверки из памяти телефона
        const cachedQuestions = localStorage.getItem('cached_checklist');
        if (cachedQuestions) {
            renderChecklist(JSON.parse(cachedQuestions));
        } else {
            container.innerHTML = "Ошибка: чек-лист не сохранен в памяти устройства. Подключитесь к сети.";
        }
    }
}

function renderChecklist(data) {
    const container = document.getElementById('questions-container');
    container.innerHTML = "";
    data.forEach(q => {
        const card = document.createElement('div');
        card.className = 'card'; card.id = 'q-box-' + q.id;
        card.innerHTML = `<div class="badge">${q.category}</div><p style="margin:5px 0 12px 0; font-size:16px;">${q.question}</p>`;
        if(q.normative) card.innerHTML += `<div class="normative-text"><b>Норматив:</b> <span>${q.normative}</span></div>`;
        
        const btnRow = document.createElement('div'); btnRow.className = 'btn-row';
        btnRow.innerHTML = `<button type="button" class="btn btn-success" onclick="setResult(${q.id},'Соответствует','${q.question}','${q.category}','${q.normative}')">Соответствует</button>
                            <button type="button" class="btn btn-danger" onclick="setResult(${q.id},'Нарушение','${q.question}','${q.category}','${q.normative}')">Нарушение</button>`;
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
    } else { item.status = status; }
    const comp = document.getElementById('comment-' + id);
    if (comp) comp.style.display = status === 'Нарушение' ? 'block' : 'none';
    document.getElementById('q-box-' + id).style.borderLeftColor = status === 'Соответствует' ? 'var(--success)' : 'var(--danger)';
}

// УМНОЕ ОФЛАЙН/ОНЛАЙН СОХРАНЕНИЕ
async function submitAuditWithOffline() {
    if (auditSession.results.length === 0) return alert("Чек-лист пуст!");
    
    const violations = [];
    auditSession.results.forEach(item => {
        if (item.status === 'Нарушение') {
            const val = document.getElementById('comment-' + item.id)?.value.trim() || "не расписано";
            violations.push(`• [${item.category}] ${item.question} \n  Замечание: ${val}`);
        }
    });

    finalViolationsText = violations.length > 0 ? violations.join("\n\n") : "Нарушений не выявлено.";
    auditSession.aggregatedViolations = finalViolationsText;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    if (navigator.onLine) {
        btn.innerText = "⏳ Отправка в облако...";
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(auditSession), headers: { 'Content-Type': 'text/plain' } });
            btn.innerText = "✅ Сохранено в облако!";
            document.getElementById('pdf-btn').disabled = false;
            alert("Данные в Google Таблице!");
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
    btn.innerText = "💾 Сохранено локально на телефон!";
    document.getElementById('pdf-btn').disabled = false;
    alert("⚠️ Нет связи. Акт надежно заблокирован в памяти телефона. Он выгрузится в Google Таблицу автоматически, когда вы вернетесь в зону действия интернета. Сейчас вы можете нажать кнопку №2 и сформировать PDF-файл.");
}

// АВТОМАТИЧЕСКАЯ СИНХРОНИЗАЦИЯ ПРИ ПОЯВЛЕНИИ СЕТИ
async function syncOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem('offline_audit_queue') || '[]');
    if (queue.length === 0) return;
    
    console.log(`Найдено ${queue.length} актов для выгрузки...`);
    
    for (let i = 0; i < queue.length; i++) {
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(queue[i]), headers: { 'Content-Type': 'text/plain' } });
        } catch (e) {
            return; // Сбой сети, прекращаем до следующего раза
        }
    }
    
    localStorage.removeItem('offline_audit_queue');
    alert("🔄 Внимание! Обнаружен интернет: все накопленные в офлайне акты успешно отправлены в Google Таблицу!");
}

function openNativePrintSystem() {
    document.getElementById('p-date').textContent = new Date().toLocaleDateString('ru-RU');
    document.getElementById('p-inspector').textContent = auditSession.inspector;
    document.getElementById('p-object').textContent = auditSession.objectName;
    document.getElementById('p-contractor').textContent = auditSession.contractor;
    document.getElementById('p-violations').textContent = finalViolationsText;
    window.print();
}

function backToStep1() { document.getElementById('step-3-checklist').style.display = 'none'; document.getElementById('step-1-form').style.display = 'block'; }
