// НА СТРОКЕ 2 УКАЖИТЕ ССЫЛКУ, КОТОРУЮ ВАМ ВЫДАЛ GOOGLE APPS SCRIPT ПРИ ДЕПЛОЕ:
const API_URL = "https://script.google.com/macros/s/AKfycbyLFU7ceVKxS-L8kDjcJwKLZ-AAXXXzOICKNlTypxu_zopUcPtf_e90pzDi6xmbsDy7/exec"; 

let auditSession = { 
    inspector: '', 
    objectName: '', 
    contractor: '', 
    results: [] 
};

let finalViolationsText = "";

document.addEventListener("DOMContentLoaded", async function() {
    const errorDiv = document.getElementById('error-display');
    const loadingEl = document.getElementById('setup-loading');
    
    try {
        const response = await fetch(API_URL + "?action=getSetupData", { method: "GET", redirect: "follow" });
        const rawText = await response.text();
        
        if (rawText.includes("Google Accounts") || rawText.includes("Sign in")) {
            throw new Error("Защита Google заблокировала анонимный доступ.");
        }
        
        const res = JSON.parse(rawText);
        if (!res.success) throw new Error(res.error || "Ошибка макроса");
        
        const objectSelect = document.getElementById('object-select');
        res.objects.forEach(obj => {
            objectSelect.add(new Option(obj.id + " | " + obj.name, obj.name));
        });
        
        const contractorSelect = document.getElementById('contractor-select');
        res.contractors.forEach(contr => {
            contractorSelect.add(new Option(contr, contr));
        });
        
        loadingEl.style.display = 'none';
        document.getElementById('form-fields-wrapper').style.display = 'block';
    } catch (error) {
        loadingEl.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.innerHTML = '❌ Ошибка инициализации API:\n' + error.message;
    }
});

function backToStep1() { 
    document.getElementById('step-3-checklist').style.display = 'none'; 
    document.getElementById('step-1-form').style.display = 'block'; 
}

async function startFullAudit() {
    const insp = document.getElementById('inspector').value.trim();
    const obj = document.getElementById('object-select').value;
    const contr = document.getElementById('contractor-select').value;
    
    if(!insp || !obj || !contr) return alert("Заполните ФИО и выберите Объект и Подрядчика!");
    
    auditSession.inspector = insp; 
    auditSession.objectName = obj; 
    auditSession.contractor = contr;
    auditSession.results = [];
    finalViolationsText = "";
    
    document.getElementById('pdf-btn').disabled = true;
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-btn').innerText = "1. Сохранить в Реестр Google 💾";
    
    document.getElementById('step-1-form').style.display = 'none';
    
    const container = document.getElementById('questions-container');
    container.innerHTML = "⏳ Загрузка вопросов чек-листа...";
    document.getElementById('step-3-checklist').style.display = 'block';
    
    document.getElementById('audit-meta-insp').textContent = auditSession.inspector;
    document.getElementById('audit-meta-obj').textContent = auditSession.objectName;
    document.getElementById('audit-meta-contr').textContent = auditSession.contractor;
    document.getElementById('audit-meta-date').textContent = new Date().toLocaleDateString('ru-RU');

    try {
        const response = await fetch(API_URL + "?action=getChecklist", { method: "GET", redirect: "follow" });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        container.innerHTML = "";
        
        result.data.forEach(q => {
            const card = document.createElement('div');
            card.className = 'card';
            card.id = 'q-box-' + q.id;
            
            const badge = document.createElement('div');
            badge.className = 'badge';
            badge.textContent = q.category;
            card.appendChild(badge);
            
            const txt = document.createElement('p');
            txt.style.margin = '5px 0 12px 0';
            txt.style.fontSize = '16px';
            txt.textContent = q.question;
            card.appendChild(txt);
            
            if (q.normative) {
                const norm = document.createElement('div');
                norm.className = 'normative-text';
                norm.innerHTML = '<b>Норматив:</b> <span>' + q.normative + '</span>';
                card.appendChild(norm);
            }
            
            const btnRow = document.createElement('div');
            btnRow.className = 'btn-row';
            
            const btnOk = document.createElement('button');
            btnOk.type = 'button';
            btnOk.className = 'btn btn-success';
            btnOk.textContent = 'Соответствует';
            btnOk.onclick = function() { setQuestionResult(q.id, 'Соответствует', q.question, q.category, q.normative); };
            
            const btnFail = document.createElement('button');
            btnFail.type = 'button';
            btnFail.className = 'btn btn-danger';
            btnFail.textContent = 'Нарушение';
            btnFail.onclick = function() { setQuestionResult(q.id, 'Нарушение', q.question, q.category, q.normative); };
            
            btnRow.appendChild(btnOk);
            btnRow.appendChild(btnFail);
            card.appendChild(btnRow);
            
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.id = 'comment-' + q.id;
            inp.className = 'comment-box';
            inp.placeholder = 'Опишите детали нарушения...';
            card.appendChild(inp);
            
            container.appendChild(card);
        });
    } catch(error) {
        container.innerHTML = "Ошибка загрузки вопросов: " + error.message;
    }
}

function setQuestionResult(id, status, questionText, categoryName, normativeText) {
    let item = auditSession.results.find(r => r.id === id);
    if (!item) {
        item = { id: id, question: questionText, category: categoryName, normative: normativeText, status: status, comment: '' };
        auditSession.results.push(item);
    } else { 
        item.status = status; 
    }
    
    const comp = document.getElementById('comment-' + id);
    if (comp) comp.style.display = status === 'Нарушение' ? 'block' : 'none';
    document.getElementById('q-box-' + id).style.borderLeftColor = status === 'Соответствует' ? 'var(--success)' : 'var(--danger)';
}

async function submitAuditOnly() {
    if (auditSession.results.length === 0) {
        return alert("Вы не провели оценку ни одного критерия из чек-листа!");
    }

    const violations = [];
    auditSession.results.forEach(item => {
        if (item.status === 'Нарушение') {
            const inp = document.getElementById('comment-' + item.id);
            const commentText = inp ? inp.value.trim() : '';
            
            let violationEntry = "• [" + item.category + "] " + item.question;
            if (item.normative) violationEntry += " (Пункт правил: " + item.normative + ")";
            violationEntry += "\n  Замечание инспектора: " + (commentText || "не расписано");
            
            violations.push(violationEntry);
        }
    });

    finalViolationsText = violations.length > 0 
        ? violations.join("\n\n") 
        : "Нарушений в ходе проверки не выявлено. Объект соответствует нормам ОТиПБ.";

    auditSession.aggregatedViolations = finalViolationsText;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true; 
    btn.innerText = "⏳ Сохранение в таблицу...";

    try {
        await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(auditSession),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        btn.innerText = "✅ Данные сохранены!";
        document.getElementById('pdf-btn').disabled = false;
        alert('Данные успешно сохранены во вкладку "7_Реестр_Проверок"! Нажмите кнопку "2. Открыть Акт в PDF / Печать".');
        
    } catch(googleError) {
        alert("Не удалось отправить данные в Google Таблицу. Проверьте сеть.");
        btn.disabled = false;
        btn.innerText = "1. Сохранить в Реестр Google 💾";
    }
}

// 👑 НАДЁЖНЫЙ ВЫЗОВ НАЖАТИЕМ ОДНОЙ КНОПКИ БЕЗ ОТКРЫТИЯ ОКН И ВКЛАДОК
function openNativePrintSystem() {
    const currentDateStr = new Date().toLocaleDateString('ru-RU');
    
    // Передаем данные в печатную разметку текущей страницы
    document.getElementById('p-date').textContent = currentDateStr;
    document.getElementById('p-inspector').textContent = auditSession.inspector;
    document.getElementById('p-object').textContent = auditSession.objectName;
    document.getElementById('p-contractor').textContent = auditSession.contractor;
    document.getElementById('p-violations').textContent = finalViolationsText;
    
    // Принудительно вызываем системный инструмент генерации PDF устройства
    window.print();
    
    setTimeout(() => {
        if(confirm("Печать завершена! Очистить форму чек-листа для начала новой инспекции?")) {
            location.reload();
        }
    }, 1000);
}
