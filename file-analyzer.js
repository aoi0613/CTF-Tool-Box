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
        // 1. 標準のFile APIを使用して基本メタデータを抽出
        const metadata = {
            'ファイル名': file.name,
            'ファイルの種類 (MIMEタイプ)': file.type || '不明 (拡張子から判別できない形式です)',
            'ファイルサイズ': formatBytes(file.size),
            '最終更新日時': new Date(file.lastModified).toLocaleString('ja-JP')
        };

        // 基本結果をHTMLのリスト要素として表示
        for (const [key, value] of Object.entries(metadata)) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${key}:</strong> ${value}`;
            metadataList.appendChild(li);
        }

        // 基本メタデータの表示を確定
        resultBox.style.display = 'block';

        // 2. JPEGファイルの場合のみEXIF情報の解析を試みる
        if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
            
            // exif-jsを使用して非同期でEXIFデータを取得
            EXIF.getData(file, function() {
                const allMetaData = EXIF.getAllTags(this);
                
                // 何かしらEXIFデータが存在する場合
                if (allMetaData && Object.keys(allMetaData).length > 0) {
                    
                    // 視認性のための区切りヘッダーをリストに追加
                    const headerLi = document.createElement('li');
                    headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 3px;">画像EXIFメタデータ</h4>`;
                    metadataList.appendChild(headerLi);

                    // 抽出したい主なEXIFのタグ名と、画面表示用の日本語ラベル
                    const exifFields = {
                        'Make': 'カメラ製造元',
                        'Model': 'カメラ機種名',
                        'DateTimeOriginal': '写真撮影日時',
                        'ExposureTime': 'シャッタースピード (秒)',
                        'FNumber': 'F値 (絞り値)',
                        'ISOSpeedRatings': 'ISO感度',
                        'FocalLength': '焦点距離 (mm)',
                        'GPSLatitude': 'GPS 緯度',
                        'GPSLongitude': 'GPS 経度'
                    };

                    let hasExifDisplay = false;

                    for (const [tag, label] of Object.entries(exifFields)) {
                        let value = allMetaData[tag];
                        
                        if (value !== undefined && value !== null) {
                            hasExifDisplay = true;

                            // 【特殊処理】GPSデータ（度、分、秒の配列）の簡易フォーマット
                            if ((tag === 'GPSLatitude' || tag === 'GPSLongitude') && Array.isArray(value)) {
                                if (value.length >= 3) {
                                    const deg = typeof value[0] === 'object' ? value[0].numerator / value[0].denominator : value[0];
                                    const min = typeof value[1] === 'object' ? value[1].numerator / value[1].denominator : value[1];
                                    const sec = typeof value[2] === 'object' ? value[2].numerator / value[2].denominator : value[2];
                                    value = `${deg}° ${min}' ${sec.toFixed(2)}"`;
                                    
                                    // 北緯/南緯、東経/西経の補足を付与
                                    const refTag = tag === 'GPSLatitude' ? 'GPSLatitudeRef' : 'GPSLongitudeRef';
                                    if (allMetaData[refTag]) {
                                        value += ` (${allMetaData[refTag]})`;
                                    }
                                }
                            }

                            // 【特殊処理】シャッタースピードやF値などの分数オブジェクト対応
                            if (typeof value === 'object' && value.numerator !== undefined && value.denominator !== undefined) {
                                value = value.denominator === 1 ? value.numerator : `${value.numerator}/${value.denominator}`;
                            }

                            // 画面に出力
                            const li = document.createElement('li');
                            li.innerHTML = `<strong>${label}:</strong> ${value}`;
                            metadataList.appendChild(li);
                        }
                    }

                    // EXIFデータはあるが、上記の主要項目が1つも含まれていなかった場合
                    if (!hasExifDisplay) {
                        const li = document.createElement('li');
                        li.style.color = '#777';
                        li.textContent = 'EXIFデータは存在しますが、表示可能な主要項目（撮影日時・機種名等）が含まれていませんでした。';
                        metadataList.appendChild(li);
                    }
                }
            });
        }

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

dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        processFile(file);
        
        document.getElementById('fileInput').files = e.dataTransfer.files;
    }
});