// --- マジックナンバー（ファイルシグネチャ）の定義リスト ---
const MAGIC_NUMBERS = [
    { hex: '89504e470d0a1a0a', mime: 'image/png', ext: ['png'], name: 'PNG画像' },
    { hex: 'ffd8ff', mime: 'image/jpeg', ext: ['jpg', 'jpeg'], name: 'JPEG画像' },
    { hex: '474946383761', mime: 'image/gif', ext: ['gif'], name: 'GIF画像 (GIF87a)' },
    { hex: '474946383961', mime: 'image/gif', ext: ['gif'], name: 'GIF画像 (GIF89a)' },
    { hex: '25504446', mime: 'application/pdf', ext: ['pdf'], name: 'PDFドキュメント' },
    { hex: '504b0304', mime: 'application/zip', ext: ['zip', 'docx', 'xlsx', 'pptx', 'jar', 'apk'], name: 'ZIPアーカイブ / Office文書' },
    { hex: '4d5a', mime: 'application/x-msdownload', ext: ['exe', 'dll', 'sys'], name: 'Windows実行ファイル/ライブラリ (MZ)' },
    { hex: '7f454c46', mime: 'application/x-elf', ext: ['elf', 'o', 'so', 'bin'], name: 'Linux ELF実行ファイル' },
    { hex: '377abcaf271c', mime: 'application/x-7z-compressed', ext: ['7z'], name: '7-Zipアーカイブ' },
    { hex: '526172211a07', mime: 'application/vnd.rar', ext: ['rar'], name: 'RARアーカイブ' },
    { hex: '424d', mime: 'image/bmp', ext: ['bmp'], name: 'BMP画像' },
    { hex: '494433', mime: 'audio/mpeg', ext: ['mp3'], name: 'MP3音声 (ID3v2)' },
    { hex: '1f8b', mime: 'application/gzip', ext: ['gz', 'tar.gz'], name: 'GZIP圧縮ファイル' }
];

// --- 補助関数: ファイルの先頭バイトからシグネチャを判定 ---
async function detectFileType(file) {
    try {
        // 先頭16バイトをスライスして読み込む
        const buffer = await file.slice(0, 16).arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        
        // 16進数の文字列に変換
        let hexString = '';
        for (let i = 0; i < uint8.length; i++) {
            hexString += uint8[i].toString(16).padStart(2, '0');
        }

        // マジックナンバーリストと前方一致で照合
        for (const type of MAGIC_NUMBERS) {
            if (hexString.startsWith(type.hex)) {
                // 画面表示用に「FF D8 FF」のようにスペース区切りの美しいHEXにする
                const formattedHex = type.hex.toUpperCase().match(/.{1,2}/g).join(' ');
                return {
                    name: type.name,
                    mime: type.mime,
                    exts: type.ext,
                    hex: formattedHex,
                    matched: true
                };
            }
        }

        // マッチしなかった場合は先頭8バイト分をそのまま表示用として返す
        const rawHex = hexString.substring(0, 16).toUpperCase().match(/.{1,2}/g).join(' ');
        return {
            name: '未知の形式 / 解析不能',
            mime: 'unknown',
            exts: [],
            hex: rawHex,
            matched: false
        };

    } catch (e) {
        console.error('シグネチャ読み込みエラー:', e);
        return { name: '読み込みエラー', mime: 'unknown', exts: [], hex: '-', matched: false };
    }
}

// --- 共通のファイル解析処理 ---
async function processFile(file) {
    const errorMessage = document.getElementById('errorMessage');
    const resultBox = document.getElementById('resultBox');
    const metadataList = document.getElementById('metadataList');
    const signatureAlert = document.getElementById('signatureAlert');

    // 表示の初期化
    errorMessage.textContent = '';
    metadataList.innerHTML = '';
    signatureAlert.innerHTML = '';
    resultBox.style.display = 'none';

    if (!file) {
        errorMessage.textContent = 'エラー: ファイルが読み込めませんでした。';
        return;
    }

    try {
        // 0. マジックナンバーによる真のファイル形式特定
        const detected = await detectFileType(file);
        const fileExt = file.name.split('.').pop().toLowerCase(); // 実際のファイルの拡張子

        // 偽装チェックとアラートバッジの生成
        if (detected.matched) {
            if (detected.exts.includes(fileExt)) {
                signatureAlert.innerHTML = `<div class="alert-badge badge-success">✓ ファイル検証: 正常（拡張子と内部シグネチャが一致しています: ${detected.name}）</div>`;
            } else {
                signatureAlert.innerHTML = `<div class="alert-badge badge-warning">⚠️ 【警告】ファイル形式の偽装を検知しました！<br>拡張子は「.${fileExt}」ですが、バイナリシグネチャは「${detected.name}」を示しています。</div>`;
            }
        } else {
            signatureAlert.innerHTML = `<div class="alert-badge badge-info">ℹ シグネチャ解析: 未知のファイル形式です（拡張子 .${fileExt} として通常のメタデータ展開を試みます）</div>`;
        }

        // 1. 標準のFile APIを使用して基本メタデータを抽出
        const metadata = {
            'ファイル名': file.name,
            'OS判定の形式 (MIME)': file.type || '不明',
            'シグネチャ判定の形式': `<strong>${detected.name}</strong>`,
            'マジックナンバー (HEX)': `<code style="background:#efefef; padding:2px 4px; border-radius:4px;">${detected.hex}</code>`,
            'ファイルサイズ': formatBytes(file.size),
            '最終更新日時': new Date(file.lastModified).toLocaleString('ja-JP')
        };

        // 基本結果をHTMLのリスト要素として表示
        for (const [key, value] of Object.entries(metadata)) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${key}:</strong> ${value}`;
            metadataList.appendChild(li);
        }

        // 結果エリアを表示
        resultBox.style.display = 'block';

        // ==========================================
        // 2. JPEGファイルの解析
        // 拡張子がjpg/jpeg、または「中身が真のJPEG」だった場合に実行
        // ==========================================
        if (detected.mime === 'image/jpeg' || fileExt === 'jpg' || fileExt === 'jpeg') {
            EXIF.getData(file, function() {
                const allMetaData = EXIF.getAllTags(this);
                if (allMetaData && Object.keys(allMetaData).length > 0) {
                    const headerLi = document.createElement('li');
                    headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 3px;">画像EXIFメタデータ</h4>`;
                    metadataList.appendChild(headerLi);

                    const exifFields = {
                        'Make': 'カメラ製造元', 'Model': 'カメラ機種名', 'DateTimeOriginal': '写真撮影日時',
                        'ExposureTime': 'シャッタースピード (秒)', 'FNumber': 'F値 (絞り値)', 'ISOSpeedRatings': 'ISO感度',
                        'FocalLength': '焦点距離 (mm)', 'GPSLatitude': 'GPS 緯度', 'GPSLongitude': 'GPS 経度'
                    };

                    let hasExifDisplay = false;
                    for (const [tag, label] of Object.entries(exifFields)) {
                        let value = allMetaData[tag];
                        if (value !== undefined && value !== null) {
                            hasExifDisplay = true;

                            if ((tag === 'GPSLatitude' || tag === 'GPSLongitude') && Array.isArray(value)) {
                                if (value.length >= 3) {
                                    const deg = typeof value[0] === 'object' ? value[0].numerator / value[0].denominator : value[0];
                                    const min = typeof value[1] === 'object' ? value[1].numerator / value[1].denominator : value[1];
                                    const sec = typeof value[2] === 'object' ? value[2].numerator / value[2].denominator : value[2];
                                    value = `${deg}° ${min}' ${sec.toFixed(2)}"`;
                                    const refTag = tag === 'GPSLatitude' ? 'GPSLatitudeRef' : 'GPSLongitudeRef';
                                    if (allMetaData[refTag]) value += ` (${allMetaData[refTag]})`;
                                }
                            }
                            if (typeof value === 'object' && value.numerator !== undefined && value.denominator !== undefined) {
                                value = value.denominator === 1 ? value.numerator : `${value.numerator}/${value.denominator}`;
                            }

                            const li = document.createElement('li');
                            li.innerHTML = `<strong>${label}:</strong> ${value}`;
                            metadataList.appendChild(li);
                        }
                    }
                    if (!hasExifDisplay) {
                        const li = document.createElement('li');
                        li.style.color = '#777';
                        li.textContent = 'EXIFデータは存在しますが、表示可能な主要項目が含まれていません。';
                        metadataList.appendChild(li);
                    }
                }
            });
        }

        // ==========================================
        // 3. PDFファイルの解析
        // 拡張子がpdf、または「中身が真のPDF」だった場合に実行
        // ==========================================
        if (detected.mime === 'application/pdf' || fileExt === 'pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

                const pdfMetaData = {
                    'タイトル (Title)': pdfDoc.getTitle(),
                    '作成者 (Author)': pdfDoc.getAuthor(),
                    '件名 (Subject)': pdfDoc.getSubject(),
                    'キーワード (Keywords)': pdfDoc.getKeywords(),
                    '作成ツール (Creator)': pdfDoc.getCreator(),
                    'プロデューサー (Producer)': pdfDoc.getProducer(),
                    '作成日時 (CreationDate)': pdfDoc.getCreationDate() ? pdfDoc.getCreationDate().toLocaleString('ja-JP') : null,
                    '更新日時 (ModDate)': pdfDoc.getModificationDate() ? pdfDoc.getModificationDate().toLocaleString('ja-JP') : null
                };

                const headerLi = document.createElement('li');
                headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 3px;">PDFメタデータ</h4>`;
                metadataList.appendChild(headerLi);

                let hasPdfDisplay = false;
                for (const [key, value] of Object.entries(pdfMetaData)) {
                    if (value) {
                        hasPdfDisplay = true;
                        const li = document.createElement('li');
                        li.innerHTML = `<strong>${key}:</strong> <span style="word-break: break-all;">${value}</span>`;
                        metadataList.appendChild(li);
                    }
                }
                if (!hasPdfDisplay) {
                    const li = document.createElement('li');
                    li.style.color = '#777';
                    li.textContent = 'PDF内にメタデータ（作成者情報など）は設定されていませんでした。';
                    metadataList.appendChild(li);
                }

            } catch (pdfError) {
                console.error('PDF解析エラー:', pdfError);
                // 拡張子詐欺で中身がPDFではない場合は、ここでエラーを出さずに静かにスルーさせる
                if (detected.mime === 'application/pdf') {
                    const li = document.createElement('li');
                    li.style.color = 'red';
                    li.textContent = 'PDFシグネチャを検知しましたが、構造の解析に失敗しました。';
                    metadataList.appendChild(li);
                }
            }
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
document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    processFile(file);
});

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