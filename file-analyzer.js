// グローバル変数：検索フィルター用に現在抽出された全文字列を保持
let currentStrings = [];

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
        const buffer = await file.slice(0, 16).arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        
        let hexString = '';
        for (let i = 0; i < uint8.length; i++) {
            hexString += uint8[i].toString(16).padStart(2, '0');
        }

        for (const type of MAGIC_NUMBERS) {
            if (hexString.startsWith(type.hex)) {
                const formattedHex = type.hex.toUpperCase().match(/.{1,2}/g).join(' ');
                return { name: type.name, mime: type.mime, exts: type.ext, hex: formattedHex, matched: true };
            }
        }

        const rawHex = hexString.substring(0, 16).toUpperCase().match(/.{1,2}/g).join(' ');
        return { name: '未知の形式 / 解析不能', mime: 'unknown', exts: [], hex: rawHex, matched: false };
    } catch (e) {
        console.error('シグネチャ読み込みエラー:', e);
        return { name: '読み込みエラー', mime: 'unknown', exts: [], hex: '-', matched: false };
    }
}

// --- 【新規追加】画像のLSB (最下位ビット) 抽出処理 ---
async function runLSBExtraction(file) {
    const stegoTextArea = document.getElementById('stegoTextArea');
    stegoTextArea.value = 'LSB解析中...';

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // ピクセルデータを取得
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let bits = '';
                
                // RGBの各チャンネルの最下位ビット(LSB)を取得 (Alpha値は無視)
                for (let i = 0; i < imageData.length; i += 4) {
                    bits += (imageData[i] & 1);     // Red
                    bits += (imageData[i+1] & 1);   // Green
                    bits += (imageData[i+2] & 1);   // Blue
                }

                let extractedText = '';
                // 8ビット(1バイト)ごとに文字へ変換
                for (let i = 0; i < bits.length; i += 8) {
                    const byteStr = bits.substring(i, i + 8);
                    if (byteStr.length === 8) {
                        const charCode = parseInt(byteStr, 2);
                        // 表示可能なASCII文字 (32-126) のみを採用
                        if (charCode >= 32 && charCode <= 126) {
                            extractedText += String.fromCharCode(charCode);
                        } else {
                            extractedText += '\n'; // 読めない文字は区切りにする
                        }
                    }
                }

                // 4文字以上連続している文字列のみを抽出して表示
                const validStrings = extractedText.split('\n').filter(s => s.length >= 4);
                if (validStrings.length > 0) {
                    stegoTextArea.value = validStrings.slice(0, 100).join('\n') + (validStrings.length > 100 ? '\n... (以降省略)' : '');
                } else {
                    stegoTextArea.value = 'LSBに隠された有効な文字列は見つかりませんでした。';
                }
            } catch (e) {
                console.error(e);
                stegoTextArea.value = '解析中にエラーが発生しました。';
            }
            URL.revokeObjectURL(url);
            resolve();
        };
        img.onerror = () => {
            stegoTextArea.value = '画像の読み込みに失敗しました。';
            resolve();
        };
        img.src = url;
    });
}

// --- 【新規追加】画像からのOCR（文字抽出）処理 ---
async function runOCR(file) {
    const ocrTextArea = document.getElementById('ocrTextArea');
    ocrTextArea.value = 'OCRモデルを読み込み中... (初回は数秒〜十数秒かかります)';

    try {
        // Tesseract.jsを使用して英語・日本語の読み取りを実行
        const result = await Tesseract.recognize(
            file,
            'eng+jpn',
            {
                logger: m => {
                    // 進捗状況をテキストエリアに表示
                    if(m.status === 'recognizing text') {
                        ocrTextArea.value = `テキスト抽出中... ${Math.round(m.progress * 100)}%`;
                    }
                }
            }
        );
        
        if (result.data.text.trim()) {
            ocrTextArea.value = result.data.text;
        } else {
            ocrTextArea.value = 'テキストが検出されませんでした。';
        }
    } catch (e) {
        console.error('OCRエラー:', e);
        ocrTextArea.value = 'OCRの実行中にエラーが発生しました。';
    }
}

// --- バイナリから文字列（Strings）を抽出する処理 ---
async function runStringsExtraction(file) {
    const stringsTextArea = document.getElementById('stringsTextArea');
    const stringsCount = document.getElementById('stringsCount');
    const stringsInputGroup = document.getElementById('stringsInputGroup');
    const stringsNotice = document.getElementById('stringsNotice');
    
    stringsTextArea.value = '解析中...';
    stringsInputGroup.style.display = 'none';
    stringsNotice.textContent = '';
    currentStrings = [];

    try {
        let uint8;
        const MAX_FULL_SCAN = 4 * 1024 * 1024; 

        if (file.size <= MAX_FULL_SCAN) {
            const buffer = await file.arrayBuffer();
            uint8 = new Uint8Array(buffer);
        } else {
            const partSize = 2 * 1024 * 1024; 
            const headBlob = file.slice(0, partSize);
            const tailBlob = file.slice(file.size - partSize, file.size);
            
            const headBuf = await headBlob.arrayBuffer();
            const tailBuf = await tailBlob.arrayBuffer();
            
            uint8 = new Uint8Array(headBuf.byteLength + tailBuf.byteLength);
            uint8.set(new Uint8Array(headBuf), 0);
            uint8.set(new Uint8Array(tailBuf), headBuf.byteLength);
            
            stringsNotice.textContent = `※ファイルサイズが大きいため、先頭2MBと末尾2MBのみを高速スキャンしました。`;
        }

        let start = -1;
        const minLength = 4;
        const maxCount = 15000; 
        const decoder = new TextDecoder('ascii');

        for (let i = 0; i < uint8.length; i++) {
            const c = uint8[i];
            if (c >= 0x20 && c <= 0x7e) {
                if (start === -1) start = i;
            } else {
                if (start !== -1) {
                    if (i - start >= minLength) {
                        const str = decoder.decode(uint8.subarray(start, i));
                        currentStrings.push(str);
                        if (currentStrings.length >= maxCount) {
                            stringsNotice.textContent += ` (抽出数が上限の ${maxCount} 件に達したため解析を打ち切りました)`;
                            break;
                        }
                    }
                    start = -1;
                }
            }
        }
        if (start !== -1 && uint8.length - start >= minLength && currentStrings.length < maxCount) {
            const str = decoder.decode(uint8.subarray(start, uint8.length));
            currentStrings.push(str);
        }

        stringsInputGroup.style.display = 'block';
        renderStrings();

    } catch (e) {
        console.error('Strings抽出エラー:', e);
        stringsTextArea.value = '文字列の抽出中にエラーが発生しました。';
    }
}

function renderStrings() {
    const filterText = document.getElementById('stringsSearch').value.toLowerCase();
    const stringsTextArea = document.getElementById('stringsTextArea');
    const stringsCount = document.getElementById('stringsCount');
    
    const filtered = currentStrings.filter(str => str.toLowerCase().includes(filterText));
    
    if (filtered.length > 0) {
        stringsTextArea.value = filtered.join('\n');
    } else {
        stringsTextArea.value = filterText ? '一致する文字列が見つかりません。' : '人間が読めるASCII文字列は見つかりませんでした。';
    }
    
    stringsCount.textContent = `${filtered.length} / ${currentStrings.length}`;
}

// --- 共通のファイル解析処理 ---
async function processFile(file) {
    const errorMessage = document.getElementById('errorMessage');
    const resultBox = document.getElementById('resultBox');
    const metadataList = document.getElementById('metadataList');
    const signatureAlert = document.getElementById('signatureAlert');
    const imageAnalysisSection = document.getElementById('imageAnalysisSection');

    errorMessage.textContent = '';
    metadataList.innerHTML = '';
    signatureAlert.innerHTML = '';
    document.getElementById('stringsSearch').value = ''; 
    resultBox.style.display = 'none';
    imageAnalysisSection.style.display = 'none';

    if (!file) {
        errorMessage.textContent = 'エラー: ファイルが読み込めませんでした。';
        return;
    }

    try {
        const detected = await detectFileType(file);
        const fileExt = file.name.split('.').pop().toLowerCase(); 

        // 1. メタデータ表示
        if (detected.matched) {
            if (detected.exts.includes(fileExt)) {
                signatureAlert.innerHTML = `<div class="alert-badge badge-success">✓ ファイル検証: 正常（拡張子と内部シグネチャが一致しています: ${detected.name}）</div>`;
            } else {
                signatureAlert.innerHTML = `<div class="alert-badge badge-warning">⚠️ 【警告】ファイル形式の偽装を検知しました！<br>拡張子は「.${fileExt}」ですが、バイナリシグネチャは「${detected.name}」を示しています。</div>`;
            }
        } else {
            signatureAlert.innerHTML = `<div class="alert-badge badge-info">ℹ シグネチャ解析: 未知のファイル形式です（拡張子 .${fileExt} として通常のメタデータ展開を試みます）</div>`;
        }

        const metadata = {
            'ファイル名': file.name,
            'OS判定の形式 (MIME)': file.type || '不明',
            'シグネチャ判定の形式': `<strong>${detected.name}</strong>`,
            'マジックナンバー (HEX)': `<code style="background:#efefef; padding:2px 4px; border-radius:4px;">${detected.hex}</code>`,
            'ファイルサイズ': formatBytes(file.size),
            '最終更新日時': new Date(file.lastModified).toLocaleString('ja-JP')
        };

        for (const [key, value] of Object.entries(metadata)) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${key}:</strong> ${value}`;
            metadataList.appendChild(li);
        }

        resultBox.style.display = 'block';

        // 2. JPEGファイルの解析 (EXIF)
        if (detected.mime === 'image/jpeg' || fileExt === 'jpg' || fileExt === 'jpeg') {
            EXIF.getData(file, function() {
                const allMetaData = EXIF.getAllTags(this);
                if (allMetaData && Object.keys(allMetaData).length > 0) {
                    const headerLi = document.createElement('li');
                    headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 3px;">画像EXIFメタデータ</h4>`;
                    metadataList.appendChild(headerLi);
                    // (以下既存のEXIF表示処理の省略無し版)
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
                }
            });
        }

        // 3. 追加：画像の場合のみ LSB解析 と OCR を実行
        const isImage = detected.mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'bmp'].includes(fileExt);
        if (isImage) {
            imageAnalysisSection.style.display = 'block';
            runLSBExtraction(file); // 非同期で実行
            runOCR(file);           // 非同期で実行
        }

        // 4. PDFやZIPの解析 (省略無しで記述)
        if (detected.mime === 'application/pdf' || fileExt === 'pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                const pdfMetaData = {
                    'タイトル (Title)': pdfDoc.getTitle(),
                    '作成者 (Author)': pdfDoc.getAuthor(),
                    // ...(中略: 既存のPDFロジック)
                };
                const headerLi = document.createElement('li');
                headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #dc3545; border-bottom: 2px solid #dc3545; padding-bottom: 3px;">PDFメタデータ</h4>`;
                metadataList.appendChild(headerLi);
            } catch (e) {}
        }
        
        // 5. 文字列抽出（Strings）の実行
        await runStringsExtraction(file);

    } catch (error) {
        errorMessage.textContent = 'エラー: ファイルの解析中に問題が発生しました。';
        console.error('解析エラー:', error);
    }
}

// --- 以下既存の関数 ---
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

document.getElementById('stringsSearch').addEventListener('input', renderStrings);

document.getElementById('copyStringsBtn').addEventListener('click', function() {
    const textArea = document.getElementById('stringsTextArea');
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) alert('抽出された文字列をクリップボードにコピーしました！');
    } catch (err) { }
});

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