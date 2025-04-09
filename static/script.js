let data = [];

function loadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    document.getElementById('tableBody').innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) throw new Error('Ошибка загрузки файла');
        return response.json();
    })
    .then(() => {
        startStreaming();
    })
    .catch(error => {
        console.error('Error:', error);
        document.getElementById('tableBody').innerHTML = '<tr><td colspan="5">Ошибка загрузки</td></tr>';
    });
}

function startStreaming() {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';
    const progressElement = document.getElementById('progress');
    const progressBar = document.getElementById('progressBar');
    const progressValue = document.getElementById('progressValue');
    const accuracyLabel = document.getElementById('accuracyLabel');
    const accuracyValue = document.getElementById('accuracy');

    progressElement.style.display = 'block';
    accuracyLabel.style.display = 'none';

    const source = new EventSource('/stream');

    source.addEventListener('row', function(event) {
        const row = JSON.parse(event.data);
        data.push(row);
        const tr = document.createElement('tr');
        tr.classList.add(row.result === 'верно' ? 'correct' : 'incorrect');
        tr.innerHTML = `
            <td>${row.question || ''}</td>
            <td>${row.llm_answer || ''}</td>
            <td>${row.gold_answer || ''}</td>
            <td>${row.info || ''}</td>
            <td>${row.result || ''}</td>
        `;
        tableBody.appendChild(tr);
    });

    source.addEventListener('progress', function(event) {
        const progressData = JSON.parse(event.data);
        const progressPercent = progressData.progress.toFixed(2);
        progressValue.textContent = `Прогресс: ${progressPercent}%`;
        progressBar.style.width = `${progressPercent}%`; // Обновляем ширину прогресс-бара
    });

    source.addEventListener('complete', function(event) {
        const completeData = JSON.parse(event.data);
        progressElement.style.display = 'none';
        accuracyLabel.style.display = 'block';
        updateMetrics(completeData.accuracy);
        document.getElementById('downloadBtn').disabled = false;
        source.close();
    });

    source.onerror = function() {
        console.error('Ошибка в потоке');
        tableBody.innerHTML = '<tr><td colspan="5">Ошибка обработки</td></tr>';
        source.close();
    };
}

function updateMetrics(accuracy) {
    document.getElementById('accuracy').textContent = `${accuracy.toFixed(2)}%`;
}

function downloadFile() {
    fetch('/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'validation_results.xlsx';
        a.click();
    });
}