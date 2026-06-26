// ファイルが選択されたときのイベントリスナー
document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    const errorMessage = document.getElementById('errorMessage');
    const resultBox = document.getElementById('resultBox');
    const metadataList = document.getElementById('metadataList');

    // 表示の初期化
    errorMessage.textContent = '';
    metadataList.innerHTML = '';
    resultBox.style.display = 'none';

    // ユーザ入力の検証（ファイル選択キャンセル時の処理）
    if (!file) {
        errorMessage.textContent = 'エラー: ファイルが選択されていません。';
        return;
    }

    try {
        // 標準のFile APIを使用してメタデータを抽出
        const metadata = {
            'ファイル名': file.name,
            // file.type はMIMEタイプ（例: image/jpeg）を返します。不明な場合は空文字になります。
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
        // 予期せぬエラーのハンドリング
        errorMessage.textContent = 'エラー: ファイルの解析中に問題が発生しました。';
        console.error('解析エラー:', error);
    }
});

// 補助関数: バイト数を読みやすい単位（KB, MB, GBなど）に変換する
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}