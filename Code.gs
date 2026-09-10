/**
 * THI ĐUA TUẦN 2026-2027 - Apps Script API V1.1
 * Spreadsheet: TỔNG KẾT TUẦN 2026-2027
 */
const SPREADSHEET_ID = '1iarqsBIYbot9KD0UQAhZcwlQEiJZhSHxQk8NP1496g4';
const START_SCORE = 200;
const TOKEN_DAYS = 30;
const CLASSES = ['10A','10B','10C','10D','11A','11B','11C','11D','11E','11F','11G','12A','12B','12C','12D','12E','12F'];

function doGet() {
  return json_({ok:true, service:'THI_DUA_TUAN_API', version:'1.1.0'});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    if (action === 'login') return json_(login_(body));
    if (action === 'criteria') return json_(criteria_(body));
    if (action === 'weekStatus') return json_(weekStatus_(body));
    if (action === 'submit') return json_(submit_(body));
    if (action === 'changePin') return json_(changePin_(body));
    return json_({ok:false,error:'UNKNOWN_ACTION'});
  } catch (err) {
    log_('ERROR', err && err.stack ? err.stack : String(err));
    return json_({ok:false,error:'SERVER_ERROR',message:String(err && err.message ? err.message : err)});
  }
}

/** Chạy 1 lần trước khi deploy Web App hoặc sau khi thay đổi cấu trúc hệ thống. */
function setupSystem() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureDataColumns_(ss);
  const accounts = ensureSheet_(ss, 'TAI_KHOAN', ['Tài khoản','PIN_HASH','Lớp','Vai trò','Họ tên','Trạng thái','Token','Token hết hạn','Đổi PIN']);
  const issue = ensureSheet_(ss, 'PHAT_TAI_KHOAN', ['Tài khoản','PIN tạm','Lớp','Ghi chú']);
  ensureSheet_(ss, 'BAO_CAO_TUAN', ['SubmissionID','Thời gian','Tuần','Lớp','Tổng trừ','Tổng cộng','Tổng điểm','Trạng thái','Tài khoản','Ghi chú']);
  ensureSheet_(ss, 'API_LOG', ['Thời gian','Loại','Nội dung']);

  if (accounts.getLastRow() <= 1) {
    const rows = [], issueRows = [];
    CLASSES.forEach(lop => {
      const user = 'LT' + lop;
      const pin = String(Math.floor(100000 + Math.random()*900000));
      rows.push([user, hash_(pin), lop, 'LOP_TRUONG', 'Lớp trưởng '+lop, 'Hoạt động', '', '', true]);
      issueRows.push([user, pin, lop, 'PIN tạm - phát riêng cho lớp trưởng; đổi sau lần đăng nhập đầu tiên']);
    });
    accounts.getRange(2,1,rows.length,rows[0].length).setValues(rows);
    issue.getRange(2,1,issueRows.length,issueRows[0].length).setValues(issueRows);
  }

  [accounts,issue,ss.getSheetByName('BAO_CAO_TUAN'),ss.getSheetByName('API_LOG')].forEach(s => {
    s.setFrozenRows(1);
    s.autoResizeColumns(1, Math.min(s.getLastColumn(),10));
  });
  SpreadsheetApp.flush();
  return 'Hệ thống đã sẵn sàng cho 17 lớp: 10A-10D, 11A-11G, 12A-12F.';
}

function login_(b) {
  const username = normalizeUsername_(b.username);
  const pin = String(b.pin || '').trim();
  if (!username || !pin) return {ok:false,error:'LOGIN_FAILED'};

  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('TAI_KHOAN');
  if (!sh) return {ok:false,error:'SYSTEM_NOT_SETUP'};
  const data = sh.getDataRange().getValues();

  for (let r=1;r<data.length;r++) {
    if (String(data[r][0]).toUpperCase() !== username) continue;
    if (String(data[r][5]) !== 'Hoạt động' || String(data[r][1]) !== hash_(pin)) {
      return {ok:false,error:'LOGIN_FAILED'};
    }
    const className = String(data[r][2]).trim().toUpperCase();
    if (!CLASSES.includes(className)) return {ok:false,error:'CLASS_NOT_ACTIVE'};

    const token = Utilities.getUuid()+Utilities.getUuid();
    const exp = new Date(Date.now()+TOKEN_DAYS*86400000);
    sh.getRange(r+1,7,1,2).setValues([[token,exp]]);
    SpreadsheetApp.flush();
    return {
      ok:true,
      token,
      className,
      role:String(data[r][3]),
      displayName:String(data[r][4]),
      mustChangePin:Boolean(data[r][8])
    };
  }
  return {ok:false,error:'LOGIN_FAILED'};
}

function normalizeUsername_(value) {
  let s = String(value || '').trim().toUpperCase().replace(/\s+/g,'');
  if (/^(10[A-D]|11[A-G]|12[A-F])$/.test(s)) s = 'LT' + s;
  if (/^(10[A-D]|11[A-G]|12[A-F])_LT$/.test(s)) s = 'LT' + s.replace('_LT','');
  return s;
}

function criteria_(b) {
  auth_(b.token);
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('DM_TIEU_CHI');
  if (!sh) throw new Error('MISSING_CRITERIA_SHEET');
  const data = sh.getDataRange().getValues();
  const out = [];
  for (let r=1;r<data.length;r++) {
    if (!data[r][0]) continue;
    out.push({
      code:String(data[r][0]),
      name:String(data[r][1]),
      unit:String(data[r][2]),
      point:Number(data[r][3]),
      group:String(data[r][4])
    });
  }
  return {ok:true,criteria:out,startScore:START_SCORE};
}

function weekStatus_(b) {
  const user = auth_(b.token);
  const week = validWeek_(b.week);
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('BAO_CAO_TUAN');
  if (!sh || sh.getLastRow()<2) return {ok:true,status:null};
  const data = sh.getDataRange().getValues();
  for (let r=data.length-1;r>=1;r--) {
    if (Number(data[r][2])===week && String(data[r][3])===user.className && String(data[r][7])!=='Đã thay thế') {
      return {ok:true,status:String(data[r][7]),score:Number(data[r][6]),submissionId:String(data[r][0])};
    }
  }
  return {ok:true,status:null};
}

function submit_(b) {
  const user = auth_(b.token);
  const week = validWeek_(b.week);
  const entries = Array.isArray(b.entries) ? b.entries : [];
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureDataColumns_(ss);

  const crit = criteriaMap_(ss);
  const report = ss.getSheetByName('BAO_CAO_TUAN');
  const detail = ss.getSheetByName('DATA_CHI_TIET');
  if (!report || !detail) throw new Error('Thiếu sheet dữ liệu. Hãy chạy setupSystem().');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const reportData = report.getDataRange().getValues();
    for (let r=reportData.length-1;r>=1;r--) {
      if (Number(reportData[r][2])===week && String(reportData[r][3])===user.className) {
        const st=String(reportData[r][7]);
        if (st==='Đã duyệt') return {ok:false,error:'WEEK_LOCKED'};
        if (st==='Chờ duyệt') report.getRange(r+1,8).setValue('Đã thay thế');
      }
    }

    markOldDetails_(detail, week, user.className);
    const submissionId = Utilities.getUuid();
    let plus=0, minus=0;
    const rows=[];

    entries.forEach(x => {
      const code=String(x.code||'').trim().toUpperCase();
      const c=crit[code];
      if(!c) throw new Error('Mã tiêu chí không hợp lệ: '+code);
      const qty=Math.floor(Number(x.qty||0));
      if(qty<=0 || qty>200) throw new Error('Số lượng không hợp lệ: '+code);
      const amount=c.point*qty;
      if(amount>=0) plus+=amount; else minus+=amount;
      const date=x.date ? new Date(x.date+'T12:00:00') : new Date();
      rows.push({
        main:[week,user.className,code,qty,String(x.student||''),date,String(x.note||''),'Chờ duyệt',user.username],
        meta:[submissionId,new Date()]
      });
    });

    if(rows.length){
      const start = nextDetailRow_(detail);
      detail.getRange(start,1,rows.length,9).setValues(rows.map(r=>r.main));
      detail.getRange(start,15,rows.length,2).setValues(rows.map(r=>r.meta));
    }

    const score=START_SCORE+plus+minus;
    report.appendRow([submissionId,new Date(),week,user.className,minus,plus,score,'Chờ duyệt',user.username,'']);
    SpreadsheetApp.flush();
    log_('SUBMIT', user.username+' '+user.className+' tuần '+week+' = '+score);
    return {ok:true,submissionId,score,status:'Chờ duyệt',minus,plus};
  } finally {
    lock.releaseLock();
  }
}

function nextDetailRow_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return 2;
  const a = sh.getRange(2,1,Math.max(1,last-1),1).getValues();
  for (let i=a.length-1;i>=0;i--) if (a[i][0] !== '') return i + 3;
  return 2;
}

function changePin_(b) {
  const user=auth_(b.token);
  const pin=String(b.newPin||'').trim();
  if(!/^\d{6}$/.test(pin)) return {ok:false,error:'PIN_FORMAT'};
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('TAI_KHOAN');
  const data=sh.getDataRange().getValues();
  for(let r=1;r<data.length;r++) {
    if(String(data[r][0])===user.username){
      sh.getRange(r+1,2).setValue(hash_(pin));
      sh.getRange(r+1,9).setValue(false);
      return {ok:true};
    }
  }
  return {ok:false,error:'ACCOUNT_NOT_FOUND'};
}

function auth_(token) {
  token=String(token||'');
  if(!token) throw new Error('AUTH_REQUIRED');
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('TAI_KHOAN');
  if(!sh) throw new Error('SYSTEM_NOT_SETUP');
  const data=sh.getDataRange().getValues();
  for(let r=1;r<data.length;r++) {
    if(String(data[r][6])===token){
      const exp=new Date(data[r][7]);
      if(!exp || isNaN(exp.getTime()) || exp.getTime()<Date.now()) throw new Error('TOKEN_EXPIRED');
      const className=String(data[r][2]).trim().toUpperCase();
      if(!CLASSES.includes(className)) throw new Error('CLASS_NOT_ACTIVE');
      return {username:String(data[r][0]),className,role:String(data[r][3])};
    }
  }
  throw new Error('AUTH_INVALID');
}

function validWeek_(w){
  w=Math.floor(Number(w));
  if(w<1||w>35) throw new Error('INVALID_WEEK');
  return w;
}

function criteriaMap_(ss){
  const sh=ss.getSheetByName('DM_TIEU_CHI');
  if(!sh) throw new Error('MISSING_CRITERIA_SHEET');
  const d=sh.getDataRange().getValues(),m={};
  for(let r=1;r<d.length;r++) if(d[r][0]) {
    m[String(d[r][0]).trim().toUpperCase()]={name:String(d[r][1]),unit:String(d[r][2]),point:Number(d[r][3]),group:String(d[r][4])};
  }
  return m;
}

function markOldDetails_(sh,week,lop){
  if(sh.getLastRow()<2) return;
  const d=sh.getRange(2,1,sh.getLastRow()-1,16).getValues();
  for(let r=0;r<d.length;r++) {
    if(Number(d[r][0])===week && String(d[r][1])===lop && String(d[r][7])==='Chờ duyệt') {
      sh.getRange(r+2,8).setValue('Đã thay thế');
    }
  }
}

/**
 * DATA_CHI_TIET chuẩn:
 * A:I dữ liệu nhập | J:N cột tính tự động | O:P metadata lần nộp.
 */
function ensureDataColumns_(ss){
  const sh=ss.getSheetByName('DATA_CHI_TIET');
  if(!sh) throw new Error('Không thấy DATA_CHI_TIET');

  sh.getRange(1,10,1,7).setValues([['Nội dung','Nhóm','Quy cách','Mức điểm','Thành điểm','SubmissionID','Tạo lúc']]);
  if(!sh.getRange('J2').getFormula()) sh.getRange('J2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,2,FALSE),"")))');
  if(!sh.getRange('K2').getFormula()) sh.getRange('K2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,5,FALSE),"")))');
  if(!sh.getRange('L2').getFormula()) sh.getRange('L2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,3,FALSE),"")))');
  if(!sh.getRange('M2').getFormula()) sh.getRange('M2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,4,FALSE),"")))');
  if(!sh.getRange('N2').getFormula()) sh.getRange('N2').setFormula('=ARRAYFORMULA(IF((M2:M="")+(D2:D=""),"",M2:M*D2:D))');
}

function ensureSheet_(ss,name,headers){
  let sh=ss.getSheetByName(name);
  if(!sh) sh=ss.insertSheet(name);
  if(sh.getLastRow()===0 || !sh.getRange(1,1).getValue()) sh.getRange(1,1,1,headers.length).setValues([headers]);
  return sh;
}

function hash_(s){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8);
  return bytes.map(b=>('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('');
}

function log_(type,msg){
  try{
    const ss=SpreadsheetApp.openById(SPREADSHEET_ID),sh=ss.getSheetByName('API_LOG');
    if(sh) sh.appendRow([new Date(),type,msg]);
  }catch(e){}
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
