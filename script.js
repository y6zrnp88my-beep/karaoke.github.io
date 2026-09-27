// Глобальные переменные
let songs = [];
let currentSong = null;
let mediaRecorder = null;
let audioChunks = [];
let recordings = [];

// DOM элементы
const fileUpload = document.getElementById('file-upload');
const songList = document.getElementById('song-list');
const librarySection = document.querySelector('.library-section');
const playerSection = document.getElementById('player-section');
const audioPlayer = document.getElementById('audio-player');
const currentSongTitle = document.getElementById('current-song-title');
const micSelect = document.getElementById('mic-select');
const startRecordingBtn = document.getElementById('start-recording');
const stopRecordingBtn = document.getElementById('stop-recording');
const recordingStatus = document.getElementById('recording-status');
const recordingsList = document.getElementById('recordings-list');
const backToLibraryBtn = document.getElementById('back-to-library');

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadSongsFromStorage();
    loadMicrophones();
    renderSongList();
    setupEventListeners();
});

// Загрузка микрофонов
async function loadMicrophones() {
    try {
        // Запрос разрешения на использование микрофона
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Получение списка устройств
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        micSelect.innerHTML = '';
        
        if (audioInputs.length === 0) {
            micSelect.innerHTML = '<option>Микрофон не найден</option>';
            startRecordingBtn.disabled = true;
            return;
        }
        
        audioInputs.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Микрофон ${index + 1}`;
            micSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка доступа к микрофону:', error);
        micSelect.innerHTML = '<option>Ошибка доступа к микрофону</option>';
        startRecordingBtn.disabled = true;
        alert('Необходимо разрешить доступ к микрофону для записи');
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    fileUpload.addEventListener('change', handleFileUpload);
    startRecordingBtn.addEventListener('click', startRecording);
    stopRecordingBtn.addEventListener('click', stopRecording);
    backToLibraryBtn.addEventListener('click', backToLibrary);
}

// Загрузка песен из localStorage
function loadSongsFromStorage() {
    const savedSongs = localStorage.getItem('karaokeSongs');
    if (savedSongs) {
        songs = JSON.parse(savedSongs);
    }
}

// Сохранение песен в localStorage
function saveSongsToStorage() {
    const songsData = songs.map(song => ({
        name: song.name,
        data: song.data
    }));
    localStorage.setItem('karaokeSongs', JSON.stringify(songsData));
}

// Обработка загрузки файлов
function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
        // Проверка типа файла и расширения
        const isAudioType = file.type.startsWith('audio/');
        const fileName = file.name.toLowerCase();
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus', '.webm'];
        const hasAudioExtension = audioExtensions.some(ext => fileName.endsWith(ext));
        
        if (isAudioType || hasAudioExtension) {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const song = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    data: e.target.result,
                    url: URL.createObjectURL(file)
                };
                
                songs.push(song);
                saveSongsToStorage();
                renderSongList();
            };
            
            reader.readAsDataURL(file);
        } else {
            alert(`Файл "${file.name}" не является аудиофайлом`);
        }
    });
    
    event.target.value = '';
}

// Отрисовка списка песен
function renderSongList() {
    if (songs.length === 0) {
        songList.innerHTML = '<div class="empty-message">Библиотека пуста. Загрузите песни!</div>';
        return;
    }
    
    songList.innerHTML = songs.map(song => `
        <div class="song-item" data-id="${song.id}">
            <div class="song-info">
                <span class="song-icon">🎵</span>
                <span class="song-name">${song.name}</span>
            </div>
            <div class="song-actions">
                <button class="btn-sing" onclick="selectSong(${song.id})">Спеть</button>
                <button class="btn-delete" onclick="deleteSong(${song.id})">Удалить</button>
            </div>
        </div>
    `).join('');
}

// Выбор песни для исполнения
function selectSong(songId) {
    currentSong = songs.find(song => song.id === songId);
    if (!currentSong) return;
    
    // Восстановление URL если его нет
    if (!currentSong.url) {
        const blob = dataURItoBlob(currentSong.data);
        currentSong.url = URL.createObjectURL(blob);
    }
    
    currentSongTitle.textContent = currentSong.name;
    audioPlayer.src = currentSong.url;
    recordings = [];
    
    librarySection.style.display = 'none';
    playerSection.style.display = 'block';
    
    renderRecordingsList();
}

// Преобразование Data URI в Blob
function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], { type: mimeString });
}

// Удаление песни
function deleteSong(songId) {
    if (confirm('Удалить эту песню из библиотеки?')) {
        songs = songs.filter(song => song.id !== songId);
        saveSongsToStorage();
        renderSongList();
    }
}

// Начало записи
async function startRecording() {
    try {
        const deviceId = micSelect.value;
        
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            const recording = {
                id: Date.now(),
                timestamp: new Date().toLocaleString('ru-RU'),
                url: audioUrl,
                blob: audioBlob
            };
            
            recordings.push(recording);
            renderRecordingsList();
            
            // Остановка всех треков
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        
        startRecordingBtn.disabled = true;
        stopRecordingBtn.disabled = false;
        recordingStatus.classList.add('recording');
        recordingStatus.querySelector('.status-text').textContent = 'Идёт запись...';
        
    } catch (error) {
        console.error('Ошибка начала записи:', error);
        alert('Не удалось начать запись. Проверьте доступ к микрофону.');
    }
}

// Остановка записи
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        startRecordingBtn.disabled = false;
        stopRecordingBtn.disabled = true;
        recordingStatus.classList.remove('recording');
        recordingStatus.querySelector('.status-text').textContent = 'Запись сохранена!';
        
        setTimeout(() => {
            recordingStatus.querySelector('.status-text').textContent = 'Готов к записи';
        }, 2000);
    }
}

// Отрисовка списка записей
function renderRecordingsList() {
    if (recordings.length === 0) {
        recordingsList.innerHTML = '<div class="empty-message">Записей пока нет</div>';
        return;
    }
    
    recordingsList.innerHTML = recordings.map(recording => `
        <div class="recording-item">
            <div class="recording-info">
                <div class="recording-time">${recording.timestamp}</div>
                <audio class="recording-audio" controls src="${recording.url}"></audio>
            </div>
            <div class="recording-actions">
                <button class="btn-download" onclick="downloadRecording(${recording.id})">
                    💾 Скачать
                </button>
            </div>
        </div>
    `).join('');
}

// Скачивание записи
function downloadRecording(recordingId) {
    const recording = recordings.find(r => r.id === recordingId);
    if (!recording) return;
    
    const a = document.createElement('a');
    a.href = recording.url;
    a.download = `karaoke_${recording.id}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Возврат к библиотеке
function backToLibrary() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    }
    
    audioPlayer.pause();
    audioPlayer.src = '';
    
    librarySection.style.display = 'block';
    playerSection.style.display = 'none';
}

// Экспорт функций в глобальную область видимости
window.selectSong = selectSong;
window.deleteSong = deleteSong;
window.downloadRecording = downloadRecording;
