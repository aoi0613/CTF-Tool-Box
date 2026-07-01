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

    errorMessage.textContent = '';
    metadataList.innerHTML = '';
    signatureAlert.innerHTML = '';
    document.getElementById('stringsSearch').value = ''; 
    resultBox.style.display = 'none';

    if (!file) {
        errorMessage.textContent = 'エラー: ファイルが読み込めませんでした。';
        return;
    }

    try {
        const detected = await detectFileType(file);
        const fileExt = file.name.split('.').pop().toLowerCase(); 

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

        // ==========================================
        // 2. JPEGファイルの解析
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
                headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #dc3545; border-bottom: 2px solid #dc3545; padding-bottom: 3px;">PDFメタデータ</h4>`;
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
                if (detected.mime === 'application/pdf') {
                    const li = document.createElement('li');
                    li.style.color = 'red';
                    li.textContent = 'PDFシグネチャを検知しましたが、構造の解析に失敗しました。';
                    metadataList.appendChild(li);
                }
            }
        }

        // ==========================================
        // 4. 追加：ZIPファイル / Office文書の解析
        // ==========================================
        const targetZipExts = ['zip', 'docx', 'xlsx', 'pptx', 'jar', 'apk', 'odt'];
        if (detected.mime === 'application/zip' || targetZipExts.includes(fileExt)) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                
                // セクション見出しの追加
                const headerLi = document.createElement('li');
                headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #28a745; border-bottom: 2px solid #28a745; padding-bottom: 3px;">ZIP構造解析結果</h4>`;
                metadataList.appendChild(headerLi);

                // ハイブリッドでのZIPコメント取得 (JSZip経由、取れなければ手動バイナリスキャン)
                const zip = await JSZip.loadAsync(arrayBuffer);
                let zipComment = zip.comment || parseZipCommentManual(arrayBuffer);
                
                const commentLi = document.createElement('li');
                if (zipComment) {
                    commentLi.innerHTML = `<strong>ZIPアーカイブ・コメント:</strong> <br><span style="display:inline-block; margin-top:5px; color: #d63384; font-family: monospace; background: #fff0f6; padding: 4px 8px; border: 1px solid #ffccd5; border-radius: 4px; font-weight: bold; word-break: break-all;">${escapeHtml(zipComment)}</span>`;
                } else {
                    commentLi.innerHTML = `<strong>ZIPアーカイブ・コメント:</strong> <span style="color: #777; font-style: italic;">なし</span>`;
                }
                metadataList.appendChild(commentLi);

                // 内部ファイル一覧
                const fileKeys = Object.keys(zip.files);
                const filesLi = document.createElement('li');
                filesLi.innerHTML = `<strong>内部ファイル一覧 (${fileKeys.length} 件):</strong>`;
                metadataList.appendChild(filesLi);

                // 綺麗に一覧化するテーブルコンテナの生成
                const tableContainer = document.createElement('div');
                tableContainer.style.overflowX = 'auto';
                tableContainer.style.marginTop = '8px';
                
                let tableHtml = `<table style="width: 100%; border-collapse: collapse; font-size: 0.85em; border: 1px solid #ddd;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">ファイルパス / 名</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: right; width: 90px;">解凍サイズ</th>
                            <th style="padding: 8px; border: 1px solid #ddd; text-align: center; width: 60px;">タイプ</th>
                        </tr>
                    </thead>
                    <tbody>`;

                let count = 0;
                for (const [filename, fileObj] of Object.entries(zip.files)) {
                    count++;
                    // 大量ファイルでのブラウザ停止対策（最大100件まで描画）
                    if (count > 100) {
                        tableHtml += `<tr><td colspan="3" style="padding: 8px; text-align: center; color: #777; font-style: italic; background: #fff;">...他 ${fileKeys.length - 100} 件のファイルを省略...</td></tr>`;
                        break;
                    }
                    
                    const isDir = fileObj.dir;
                    const typeBadge = isDir ? '<span style="color: #007bff;">フォルダ</span>' : '<span style="color: #28a745;">ファイル</span>';
                    const sizeStr = isDir ? '-' : formatBytes(fileObj._data.uncompressedSize || 0);
                    
                    tableHtml += `<tr style="background: ${count % 2 === 0 ? '#fdfdfd' : '#fff'};">
                        <td style="padding: 8px; border: 1px solid #ddd; word-break: break-all; font-family: monospace;">${escapeHtml(filename)}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${sizeStr}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-size: 0.9em;">${typeBadge}</td>
                    </tr>`;
                }
                
                tableHtml += `</tbody></table>`;
                tableContainer.innerHTML = tableHtml;
                metadataList.appendChild(tableContainer);

            } catch (zipError) {
                console.error('ZIP解析エラー:', zipError);
                if (detected.mime === 'application/zip') {
                    const li = document.createElement('li');
                    li.style.color = 'red';
                    li.textContent = 'ZIPシグネチャを検知しましたが、アーカイブの内部構造パースに失敗しました（データ破損または未対応の暗号化方式の可能性があります）。';
                    metadataList.appendChild(li);
                }
            }
        }

        // ==========================================
        // 5. 文字列抽出（Strings）の実行
        // ==========================================
        await runStringsExtraction(file);

    } catch (error) {
        errorMessage.textContent = 'エラー: ファイルの解析中に問題が発生しました。';
        console.error('解析エラー:', error);
    }
}

// --- 追加：壊れたZIPや生のバイナリ埋め込みコメントを救出する手動EOCDパース関数 ---
function parseZipCommentManual(arrayBuffer) {
    const uint8 = new Uint8Array(arrayBuffer);
    // EOCD(End of Central Directory)レコードの最小サイズは22バイト、コメント上限は65535バイト
    const scanLength = Math.min(uint8.length, 65535 + 22);
    const startOffset = uint8.length - scanLength;

    // ファイル末尾から逆方向に EOCD シグネチャ [50 4b 05 06] を探索
    for (let i = uint8.length - 22; i >= startOffset; i--) {
        if (uint8[i] === 0x50 && uint8[i+1] === 0x4b && uint8[i+2] === 0x05 && uint8[i+3] === 0x06) {
            // コメント長はEOCDの20バイト目から2バイト（リトルエンディアン）
            const commentLen = uint8[i+20] | (uint8[i+21] << 8);
            if (i + 22 + commentLen <= uint8.length) {
                const commentBytes = uint8.subarray(i + 22, i + 22 + commentLen);
                try {
                    return new TextDecoder('utf-8', { fatal: true }).decode(commentBytes);
                } catch (e) {
                    try {
                        // 日本の古い問題などのためにShift-JISでもフォールバック試行
                        return new TextDecoder('shift-jis').decode(commentBytes);
                    } catch (sjError) {
                        // どちらもダメな場合、生のバイナリキーが隠されていると判断して16進文字列で出力
                        let hexStr = '';
                        for (let j = 0; j < commentBytes.length; j++) {
                            hexStr += commentBytes[j].toString(16).padStart(2, '0') + ' ';
                        }
                        return `[バイナリデータ (HEX): ${hexStr.trim().toUpperCase()}]`;
                    }
                }
            }
        }
    }
    return null;
}

// --- 追加：HTMLインジェクション(XSS)を防止する安全なエスケープ関数 ---
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

// 検索フィルターのリアルタイム入力イベント
document.getElementById('stringsSearch').addEventListener('input', renderStrings);

// クリップボードへのコピー機能
document.getElementById('copyStringsBtn').addEventListener('click', function() {
    const textArea = document.getElementById('stringsTextArea');
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            alert('抽出された文字列をクリップボードにコピーしました！');
        } else {
            throw new Error();
        }
    } catch (err) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(textArea.value)
                .then(() => alert('クリップボードにコピーしました！'))
                .catch(() => alert('コピーに失敗しました。お使いのブラウザは対応していません。'));
        } else {
            alert('自動コピーがサポートされていません。Ctrl+C (Cmd+C) でコピーしてください。');
        }
    }
});

// ファイル選択ボタンのイベント
document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    processFile(file);
});

// ドラッグ＆ドロップのイベント
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