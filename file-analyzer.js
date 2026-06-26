// --- 共通のファイル解析処理 ---
function processFile(file) {
    const errorMessage = document.getElementById('errorMessage');
    const resultBox = document.getElementById('resultBox');
    const metadataList = document.getElementById('metadataList');

    // 表示の初期化
    errorMessage.textContent = '';
    metadataList.innerHTML = '';
    resultBox.style.display = 'none';

    if (!file) {
        errorMessage.textContent = 'エラー: ファイルが読み込めませんでした。';
        return;
    }

    try {
        // 標準のFile APIを使用してメタデータを抽出
        const metadata = {
            'ファイル名': file.name,
            'ファイルの種類 (MIMEタイプ)': file.type || '不明 (拡張子から判別できない形式です)',
            'ファイルサイズ': formatBytes(file.size),
            '最終更新日時': new Date(file.lastModified).toLocaleString('ja-JP')
        };

        // 結果をHTMLのリスト要素として組み立てて表示
        for (const [key, value] of Object.entries(metadata)) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${key}:</strong> ${value}`;
            metadataList.appendChild(li);
        }

        // 結果エリアを表示
        resultBox.style.display = 'block';

    } catch (error) {
        errorMessage.textContent = 'エラー: ファイルの解析中に問題が発生しました。';
        console.error('解析エラー:', error);
    }
}

// --- 補助関数: バイト数のフォーマット ---
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


// ==========================================
// イベントリスナーの設定
// ==========================================

// 1. ボタンから「ファイルを選択」した場合
document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    processFile(file);
});

// 2. ドラッグ＆ドロップのイベント処理
const dropZone = document.getElementById('dropZone');

// ファイルがドロップエリアに入った時（ブラウザ標準の挙動をキャンセルし、色を変える）
dropZone.addEventListener('dragover', function(e) {
    e.preventDefault(); // これがないとブラウザがファイルを開いてしまう
    dropZone.classList.add('dragover');
});

// ファイルがドロップエリアから出た時（色を元に戻す）
dropZone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

// ファイルがドロップされた時
dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    // ドロップされたファイル群から最初の1つを取得
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        processFile(file);
        
        // input要素の中身も同期させておく（内部的な状態を合わせるため）
        document.getElementById('fileInput').files = e.dataTransfer.files;
    }
});