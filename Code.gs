/**
 * THI ĐUA TUẦN 2026-2027 - API V2.1
 * Roles: LOP_TRUONG | GVCN | ADMIN
 * - Lớp trưởng: nhập/gửi báo cáo
 * - GVCN: chỉ xem tình hình lớp
 * - Admin: duyệt báo cáo, thống kê, đặt lại mật khẩu tài khoản
 */
const SPREADSHEET_ID = '1iarqsBIYbot9KD0UQAhZcwlQEiJZhSHxQk8NP1496g4';
const START_SCORE = 200;
const TOKEN_DAYS = 30;
const CLASSES = ['10A','10B','10C','10D','10E','11A','11B','11C','11D','11E','12A','12B','12C','12D','12E','12F','12G'];
const ROLES = ['LOP_TRUONG','GVCN','ADMIN'];

function doGet() {
  return json_({ok:true, service:'THI_DUA_TUAN_API', version:'2.1.0'});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    if (action === 'login') return json_(login_(body));
    if (action === 'criteria') return json_(criteria_(body));
    if (action === 'weekStatus') return json_(weekStatus_(body));
    if (action === 'submit') return json_(submit_(body));
    if (action === 'dashboard') return json_(dashboard_(body));
    if (action === 'adminDecision') return json_(adminDecision_(body));
    if (action === 'adminSetPassword') return json_(adminSetPassword_(body));
    if (action === 'syncWeek') return json_(syncWeekAction_(body));
    return json_({ok:false, error:'UNKNOWN_ACTION'});
  } catch (err) {
    log_('ERROR', err && err.stack ? err.stack : String(err));
    return json_({ok:false, error:'SERVER_ERROR', message:String(err && err.message ? err.message : err)});
  }
}

function setupSystem() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureDataColumns_(ss);
  ensureSheet_(ss,'TAI_KHOAN',['Tài khoản','MAT_KHAU_HASH','Lớp','Vai trò','Họ tên','Trạng thái','Token','Token hết hạn','Cờ cũ (không dùng)']);
  ensureSheet_(ss,'PHAT_TAI_KHOAN',['Tài khoản','Mật khẩu tạm','Lớp','Ghi chú']);
  ensureSheet_(ss,'BAO_CAO_TUAN',['SubmissionID','Thời gian','Tuần','Lớp','Tổng trừ','Tổng cộng','Tổng điểm','Trạng thái','Tài khoản','Ghi chú']);
  ensureSheet_(ss,'API_LOG',['Thời gian','Loại','Nội dung']);
  ensureSheet_(ss,'TỔNG ĐIỂM',['Tuần','Lớp','GVCN','Điểm nền','Điểm trừ','Điểm cộng','Tổng điểm','Trạng thái','Xếp hạng','Lượt vi phạm','Lượt khen thưởng','Cập nhật lúc']);
  for (let w=1; w<=35; w++) syncWeekSummary_(ss,w);
  return 'Đã đồng bộ hệ thống V2.1.';
}

function login_(b) {
  const username = normalizeUsername_(b.username);
  const password = String(b.password != null ? b.password : b.pin || '').trim();
  if (!username || !password) return {ok:false,error:'LOGIN_FAILED'};
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('TAI_KHOAN');
  if (!sh) return {ok:false,error:'SYSTEM_NOT_SETUP'};
  const data = sh.getDataRange().getValues();
  for (let r=1; r<data.length; r++) {
    const account = String(data[r][0] || '').trim().toUpperCase();
    if (account !== username) continue;
    if (String(data[r][5] || '') !== 'Hoạt động') return {ok:false,error:'ACCOUNT_DISABLED'};
    if (String(data[r][1] || '') !== hash_(password)) return {ok:false,error:'LOGIN_FAILED'};
    const role = String(data[r][3] || 'LOP_TRUONG').trim().toUpperCase();
    const className = String(data[r][2] || '').trim().toUpperCase();
    if (!ROLES.includes(role)) return {ok:false,error:'ROLE_INVALID'};
    if (role !== 'ADMIN' && !CLASSES.includes(className)) return {ok:false,error:'CLASS_NOT_ACTIVE'};
    const token = Utilities.getUuid() + Utilities.getUuid();
    const expires = new Date(Date.now() + TOKEN_DAYS*86400000);
    sh.getRange(r+1,7,1,2).setValues([[token,expires]]);
    SpreadsheetApp.flush();
    return {
      ok:true,
      token,
      username:account,
      className,
      role,
      displayName:String(data[r][4] || account),
      apiVersion:'2.1.0'
    };
  }
  return {ok:false,error:'LOGIN_FAILED'};
}

function normalizeUsername_(v) {
  let s = String(v || '').trim().toUpperCase().replace(/[\s._-]+/g,'');
  const cls = '(?:10[A-E]|11[A-E]|12[A-G])';
  if (new RegExp('^'+cls+'$').test(s)) return 'LT'+s;
  let m = s.match(new RegExp('^(?:LT|LOPTRUONG)('+cls+')$'));
  if (m) return 'LT'+m[1];
  m = s.match(new RegExp('^('+cls+')(?:LT|LOPTRUONG)$'));
  if (m) return 'LT'+m[1];
  m = s.match(new RegExp('^(?:GV|GVCN|GIAOVIEN)('+cls+')$'));
  if (m) return 'GV'+m[1];
  m = s.match(new RegExp('^('+cls+')(?:GV|GVCN|GIAOVIEN)$'));
  if (m) return 'GV'+m[1];
  return s;
}

function auth_(token) {
  token = String(token || '');
  if (!token) throw new Error('AUTH_REQUIRED');
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('TAI_KHOAN');
  if (!sh) throw new Error('SYSTEM_NOT_SETUP');
  const data = sh.getDataRange().getValues();
  for (let r=1; r<data.length; r++) {
    if (String(data[r][6] || '') !== token) continue;
    const expires = new Date(data[r][7]);
    if (!expires || isNaN(expires.getTime()) || expires.getTime() < Date.now()) throw new Error('TOKEN_EXPIRED');
    if (String(data[r][5] || '') !== 'Hoạt động') throw new Error('ACCOUNT_DISABLED');
    const role = String(data[r][3] || 'LOP_TRUONG').trim().toUpperCase();
    const className = String(data[r][2] || '').trim().toUpperCase();
    if (!ROLES.includes(role)) throw new Error('ROLE_INVALID');
    if (role !== 'ADMIN' && !CLASSES.includes(className)) throw new Error('CLASS_NOT_ACTIVE');
    return {username:String(data[r][0]), className, role, displayName:String(data[r][4] || data[r][0])};
  }
  throw new Error('AUTH_INVALID');
}

function criteria_(b) {
  const u = auth_(b.token);
  if (u.role !== 'LOP_TRUONG') return {ok:false,error:'ROLE_NOT_ALLOWED'};
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('DM_TIEU_CHI');
  if (!sh) throw new Error('MISSING_CRITERIA_SHEET');
  const data = sh.getDataRange().getValues();
  const out = [];
  for (let r=1; r<data.length; r++) {
    if (!data[r][0]) continue;
    out.push({code:String(data[r][0]), name:String(data[r][1]), unit:String(data[r][2]), point:Number(data[r][3]), group:String(data[r][4])});
  }
  return {ok:true,criteria:out,startScore:START_SCORE};
}

function weekStatus_(b) {
  const u = auth_(b.token);
  if (u.role !== 'LOP_TRUONG') return {ok:false,error:'ROLE_NOT_ALLOWED'};
  const week = validWeek_(b.week);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const status = latestWeekStatus_(ss,week,u.className);
  status.details = latestDetails_(ss,week,u.className);
  return status;
}

function submit_(b) {
  const u = auth_(b.token);
  if (u.role !== 'LOP_TRUONG') return {ok:false,error:'ROLE_NOT_ALLOWED'};
  const week = validWeek_(b.week);
  const entries = Array.isArray(b.entries) ? b.entries : [];
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureDataColumns_(ss);
  const crit = criteriaMap_(ss);
  const report = ss.getSheetByName('BAO_CAO_TUAN');
  const detail = ss.getSheetByName('DATA_CHI_TIET');
  if (!report || !detail) throw new Error('Thiếu sheet dữ liệu');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const reportData = report.getDataRange().getValues();
    for (let r=reportData.length-1; r>=1; r--) {
      if (Number(reportData[r][2]) !== week || String(reportData[r][3]) !== u.className) continue;
      const st = String(reportData[r][7]);
      if (st === 'Đã duyệt') return {ok:false,error:'WEEK_LOCKED'};
      if (st === 'Chờ duyệt') report.getRange(r+1,8).setValue('Đã thay thế');
      break;
    }
    markOldDetails_(detail,week,u.className);
    const submissionId = Utilities.getUuid();
    const now = new Date();
    let plus=0, minus=0;
    const rows=[];
    entries.forEach(x => {
      const code = String(x.code || '').trim().toUpperCase();
      const c = crit[code];
      if (!c) throw new Error('Mã tiêu chí không hợp lệ: '+code);
      const qty = Math.floor(Number(x.qty || 0));
      if (qty <= 0 || qty > 500) throw new Error('Số lượng không hợp lệ: '+code);
      const amount = c.point * qty;
      if (amount >= 0) plus += amount; else minus += amount;
      const date = x.date ? new Date(x.date+'T12:00:00') : now;
      rows.push({
        main:[week,u.className,code,qty,String(x.student||''),date,String(x.note||''),'Chờ duyệt',u.username],
        meta:[submissionId,now]
      });
    });
    if (rows.length) {
      const start = nextDetailRow_(detail);
      detail.getRange(start,1,rows.length,9).setValues(rows.map(r=>r.main));
      detail.getRange(start,15,rows.length,2).setValues(rows.map(r=>r.meta));
    }
    const score = START_SCORE + plus + minus;
    report.appendRow([submissionId,now,week,u.className,minus,plus,score,'Chờ duyệt',u.username,String(b.note||'')]);
    SpreadsheetApp.flush();
    syncWeekSummary_(ss,week);
    log_('SUBMIT',u.username+' '+u.className+' tuần '+week+' = '+score);
    return {ok:true,submissionId,score,status:'Chờ duyệt',minus,plus,updatedSummary:true};
  } finally {
    lock.releaseLock();
  }
}

function dashboard_(b) {
  const u = auth_(b.token);
  const week = validWeek_(b.week || 1);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  syncWeekSummary_(ss,week);
  if (u.role === 'ADMIN') return adminDashboard_(ss,week);
  if (u.role === 'GVCN') return teacherDashboard_(ss,week,u.className);
  return {ok:false,error:'ROLE_NOT_ALLOWED'};
}

function adminDashboard_(ss,week) {
  const rows = weekSummaryRows_(ss,week);
  const report = ss.getSheetByName('BAO_CAO_TUAN');
  const pendingReports=[];
  if (report && report.getLastRow()>1) {
    const data=report.getDataRange().getValues();
    for (let r=data.length-1; r>=1; r--) {
      if (Number(data[r][2])===week && String(data[r][7])==='Chờ duyệt') {
        pendingReports.push({submissionId:String(data[r][0]),time:dateText_(data[r][1]),week,className:String(data[r][3]),minus:Number(data[r][4]),plus:Number(data[r][5]),score:Number(data[r][6]),username:String(data[r][8])});
      }
    }
  }
  return {
    ok:true,role:'ADMIN',week,
    metrics:{
      submitted:rows.filter(x=>x.status!=='Chưa nộp').length,
      pending:rows.filter(x=>x.status==='Chờ duyệt').length,
      approved:rows.filter(x=>x.status==='Đã duyệt').length,
      rejected:rows.filter(x=>x.status==='Từ chối').length,
      notSubmitted:rows.filter(x=>x.status==='Chưa nộp').length,
      totalClasses:CLASSES.length,
      avgScore:round1_(rows.reduce((s,x)=>s+x.score,0)/CLASSES.length)
    },
    classes:rows,
    pendingReports,
    topViolations:topCriteria_(ss,week,'VI PHẠM',8),
    topRewards:topCriteria_(ss,week,'KHEN THƯỞNG',6),
    accounts:adminAccounts_(ss)
  };
}

function teacherDashboard_(ss,week,className) {
  const rows = weekSummaryRows_(ss,week);
  const row = rows.find(x=>x.className===className) || {className,score:START_SCORE,minus:0,plus:0,status:'Chưa nộp',rank:1,violations:0,rewards:0};
  const details = latestDetails_(ss,week,className);
  const violations = details.filter(x=>x.group==='VI PHẠM');
  const rewards = details.filter(x=>x.group==='KHEN THƯỞNG');
  const trend=[];
  for (let w=Math.max(1,week-5); w<=week; w++) {
    syncWeekSummary_(ss,w);
    const rr=weekSummaryRows_(ss,w).find(x=>x.className===className);
    if (rr) trend.push({week:w,score:rr.score,rank:rr.rank,status:rr.status});
  }
  return {
    ok:true,role:'GVCN',readOnly:true,week,className,
    summary:row,
    details,
    violationDetails:violations,
    rewardDetails:rewards,
    issueSummary:groupDetails_(violations),
    rewardSummary:groupDetails_(rewards),
    people:peopleSummary_(details),
    trend,
    centerAverage:round1_(rows.reduce((s,x)=>s+x.score,0)/CLASSES.length)
  };
}

function adminDecision_(b) {
  const u=auth_(b.token);
  if (u.role!=='ADMIN') return {ok:false,error:'ROLE_NOT_ALLOWED'};
  const id=String(b.submissionId||'');
  const decision=String(b.decision||'');
  if (!id || !['Đã duyệt','Từ chối'].includes(decision)) return {ok:false,error:'INVALID_DECISION'};
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const report=ss.getSheetByName('BAO_CAO_TUAN');
  const detail=ss.getSheetByName('DATA_CHI_TIET');
  if (!report) return {ok:false,error:'REPORT_SHEET_MISSING'};
  const data=report.getDataRange().getValues();
  let week=0, found=false;
  for (let r=1; r<data.length; r++) {
    if (String(data[r][0])===id) {
      week=Number(data[r][2]);
      report.getRange(r+1,8).setValue(decision);
      found=true;
      break;
    }
  }
  if (!found) return {ok:false,error:'SUBMISSION_NOT_FOUND'};
  if (detail && detail.getLastRow()>1) {
    const ids=detail.getRange(2,15,detail.getLastRow()-1,1).getValues();
    const statusRange=detail.getRange(2,8,ids.length,1);
    const values=statusRange.getValues();
    let changed=false;
    for (let i=0; i<ids.length; i++) {
      if (String(ids[i][0])===id) { values[i][0]=decision; changed=true; }
    }
    if (changed) statusRange.setValues(values);
  }
  SpreadsheetApp.flush();
  syncWeekSummary_(ss,week);
  log_('DECISION',u.username+' '+id+' -> '+decision);
  return {ok:true,status:decision,week};
}

function adminSetPassword_(b) {
  const u=auth_(b.token);
  if (u.role!=='ADMIN') return {ok:false,error:'ROLE_NOT_ALLOWED'};
  const username=normalizeUsername_(b.username);
  const password=String(b.newPassword||'').trim();
  if (!username) return {ok:false,error:'ACCOUNT_NOT_FOUND'};
  if (password.length<6 || password.length>32) return {ok:false,error:'PASSWORD_FORMAT',message:'Mật khẩu phải từ 6 đến 32 ký tự.'};
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh=ss.getSheetByName('TAI_KHOAN');
  const data=sh.getDataRange().getValues();
  for (let r=1; r<data.length; r++) {
    if (String(data[r][0]||'').trim().toUpperCase()!==username) continue;
    sh.getRange(r+1,2).setValue(hash_(password));
    sh.getRange(r+1,7,1,2).clearContent();
    if (sh.getMaxColumns()>=9) sh.getRange(r+1,9).setValue(false);
    SpreadsheetApp.flush();
    log_('PASSWORD_RESET',u.username+' reset '+username);
    return {ok:true,username,selfChanged:username===u.username,message:'Đã cập nhật mật khẩu ngay.'};
  }
  return {ok:false,error:'ACCOUNT_NOT_FOUND'};
}

function adminAccounts_(ss) {
  const sh=ss.getSheetByName('TAI_KHOAN');
  if (!sh || sh.getLastRow()<2) return [];
  const data=sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
  return data.filter(r=>r[0]).map(r=>({
    username:String(r[0]),
    className:String(r[2]||''),
    role:String(r[3]||''),
    displayName:String(r[4]||r[0]),
    status:String(r[5]||'')
  })).sort((a,b)=>roleOrder_(a.role)-roleOrder_(b.role) || a.className.localeCompare(b.className,'vi') || a.username.localeCompare(b.username));
}

function roleOrder_(r) { return r==='ADMIN'?0:r==='GVCN'?1:2; }

function groupDetails_(details) {
  const m={};
  details.forEach(x=>{
    if (!m[x.code]) m[x.code]={code:x.code,name:x.name||x.code,qty:0,amount:0};
    m[x.code].qty+=Number(x.qty||0);
    m[x.code].amount+=Number(x.amount||0);
  });
  return Object.values(m).sort((a,b)=>b.qty-a.qty || Math.abs(b.amount)-Math.abs(a.amount));
}

function peopleSummary_(details) {
  const m={};
  details.forEach(x=>{
    const name=String(x.student||'').trim();
    if (!name) return;
    if (!m[name]) m[name]={name,violations:0,rewards:0,net:0,items:0};
    const q=Number(x.qty||0);
    if (x.group==='VI PHẠM') m[name].violations+=q;
    if (x.group==='KHEN THƯỞNG') m[name].rewards+=q;
    m[name].net+=Number(x.amount||0);
    m[name].items++;
  });
  return Object.values(m).sort((a,b)=>b.violations-a.violations || b.rewards-a.rewards || a.name.localeCompare(b.name,'vi'));
}

function syncWeekAction_(b) {
  const u=auth_(b.token);
  if (u.role!=='ADMIN') return {ok:false,error:'ROLE_NOT_ALLOWED'};
  const week=validWeek_(b.week);
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  syncWeekSummary_(ss,week);
  return {ok:true,week};
}

function syncWeekSummary_(ss,week) {
  const sh=ensureSheet_(ss,'TỔNG ĐIỂM',['Tuần','Lớp','GVCN','Điểm nền','Điểm trừ','Điểm cộng','Tổng điểm','Trạng thái','Xếp hạng','Lượt vi phạm','Lượt khen thưởng','Cập nhật lúc']);
  const gvcn=gvcnMap_(ss);
  const latest=latestReportsMap_(ss,week);
  const now=new Date();
  const pre=[];
  CLASSES.forEach(c=>{
    const r=latest[c];
    const valid=r && r.status!=='Từ chối';
    const counts=r?detailCountsBySubmission_(ss,r.id):{violations:0,rewards:0};
    pre.push({
      className:c,gvcn:gvcn[c]||'',
      score:valid?Number(r.score):START_SCORE,
      minus:valid?Number(r.minus):0,
      plus:valid?Number(r.plus):0,
      status:r?r.status:'Chưa nộp',
      violations:valid?counts.violations:0,
      rewards:valid?counts.rewards:0,
      time:r?r.time:now
    });
  });
  pre.forEach(x=>x.rank=1+pre.filter(y=>y.score>x.score).length);
  const start=2+(week-1)*CLASSES.length;
  sh.getRange(start,1,CLASSES.length,12).setValues(pre.map(x=>[week,x.className,x.gvcn,START_SCORE,x.minus,x.plus,x.score,x.status,x.rank,x.violations,x.rewards,x.time]));
  sh.getRange(1,1,1,12).setValues([['Tuần','Lớp','GVCN','Điểm nền','Điểm trừ','Điểm cộng','Tổng điểm','Trạng thái','Xếp hạng','Lượt vi phạm','Lượt khen thưởng','Cập nhật lúc']]);
  sh.setFrozenRows(1);
}

function weekSummaryRows_(ss,week) {
  const sh=ss.getSheetByName('TỔNG ĐIỂM');
  const start=2+(week-1)*CLASSES.length;
  if (!sh || sh.getLastRow()<start) return [];
  return sh.getRange(start,1,CLASSES.length,12).getValues().map(r=>({
    week:Number(r[0]),className:String(r[1]),gvcn:String(r[2]||''),base:Number(r[3]),minus:Number(r[4]),plus:Number(r[5]),score:Number(r[6]),status:String(r[7]),rank:Number(r[8]),violations:Number(r[9]),rewards:Number(r[10]),updated:dateText_(r[11])
  }));
}

function latestReportsMap_(ss,week) {
  const sh=ss.getSheetByName('BAO_CAO_TUAN');
  const m={};
  if (!sh || sh.getLastRow()<2) return m;
  const data=sh.getDataRange().getValues();
  for (let r=data.length-1; r>=1; r--) {
    const className=String(data[r][3]);
    const status=String(data[r][7]);
    if (Number(data[r][2])!==week || !CLASSES.includes(className) || status==='Đã thay thế' || m[className]) continue;
    m[className]={id:String(data[r][0]),time:new Date(data[r][1]),minus:Number(data[r][4]),plus:Number(data[r][5]),score:Number(data[r][6]),status,username:String(data[r][8]||''),note:String(data[r][9]||'')};
  }
  return m;
}

function latestWeekStatus_(ss,week,className) {
  const r=latestReportsMap_(ss,week)[className];
  return r ? {ok:true,status:r.status,score:r.score,submissionId:r.id,minus:r.minus,plus:r.plus,submittedAt:dateText_(r.time),note:r.note} : {ok:true,status:null,score:START_SCORE,minus:0,plus:0,details:[]};
}

function latestDetails_(ss,week,className) {
  const r=latestReportsMap_(ss,week)[className];
  if (!r) return [];
  const sh=ss.getSheetByName('DATA_CHI_TIET');
  if (!sh || sh.getLastRow()<2) return [];
  const data=sh.getRange(2,1,sh.getLastRow()-1,16).getValues();
  const out=[];
  for (let i=0; i<data.length; i++) {
    if (String(data[i][14])!==r.id) continue;
    out.push({
      code:String(data[i][2]),qty:Number(data[i][3]),student:String(data[i][4]||''),date:dateText_(data[i][5]),note:String(data[i][6]||''),status:String(data[i][7]),name:String(data[i][9]||''),group:String(data[i][10]||''),point:Number(data[i][12]),amount:Number(data[i][13])
    });
  }
  return out;
}

function detailCountsBySubmission_(ss,id) {
  const sh=ss.getSheetByName('DATA_CHI_TIET');
  let violations=0,rewards=0;
  if (!sh || sh.getLastRow()<2) return {violations,rewards};
  const data=sh.getRange(2,4,sh.getLastRow()-1,12).getValues();
  for (let i=0; i<data.length; i++) {
    if (String(data[i][11])!==id) continue;
    const qty=Number(data[i][0]||0), group=String(data[i][7]||'');
    if (group==='VI PHẠM') violations+=qty;
    else if (group==='KHEN THƯỞNG') rewards+=qty;
  }
  return {violations,rewards};
}

function topCriteria_(ss,week,group,limit) {
  const sh=ss.getSheetByName('DATA_CHI_TIET');
  const m={};
  if (!sh || sh.getLastRow()<2) return [];
  const data=sh.getRange(2,1,sh.getLastRow()-1,14).getValues();
  for (let i=0; i<data.length; i++) {
    if (Number(data[i][0])!==week || String(data[i][10])!==group || !['Chờ duyệt','Đã duyệt'].includes(String(data[i][7]))) continue;
    const code=String(data[i][2]),qty=Number(data[i][3]||0);
    if (!m[code]) m[code]={code,name:String(data[i][9]||code),qty:0,amount:0};
    m[code].qty+=qty;
    m[code].amount+=Number(data[i][13]||0);
  }
  return Object.values(m).sort((a,b)=>b.qty-a.qty).slice(0,limit);
}

function gvcnMap_(ss) {
  const sh=ss.getSheetByName('CAU_HINH');
  const m={};
  if (!sh) return m;
  sh.getRange(2,2,17,4).getValues().forEach(r=>{ if (r[0]) m[String(r[0])]=String(r[3]||''); });
  return m;
}

function validWeek_(w) {
  w=Math.floor(Number(w));
  if (w<1 || w>35) throw new Error('INVALID_WEEK');
  return w;
}

function criteriaMap_(ss) {
  const sh=ss.getSheetByName('DM_TIEU_CHI');
  if (!sh) throw new Error('MISSING_CRITERIA_SHEET');
  const data=sh.getDataRange().getValues(), m={};
  for (let r=1; r<data.length; r++) if (data[r][0]) m[String(data[r][0]).trim().toUpperCase()]={name:String(data[r][1]),unit:String(data[r][2]),point:Number(data[r][3]),group:String(data[r][4])};
  return m;
}

function markOldDetails_(sh,week,className) {
  if (sh.getLastRow()<2) return;
  const data=sh.getRange(2,1,sh.getLastRow()-1,16).getValues();
  for (let r=0; r<data.length; r++) {
    if (Number(data[r][0])===week && String(data[r][1])===className && String(data[r][7])==='Chờ duyệt') sh.getRange(r+2,8).setValue('Đã thay thế');
  }
}

function nextDetailRow_(sh) {
  const last=sh.getLastRow();
  if (last<2) return 2;
  const col=sh.getRange(2,1,Math.max(1,last-1),1).getValues();
  for (let i=col.length-1; i>=0; i--) if (col[i][0]!=='') return i+3;
  return 2;
}

function ensureDataColumns_(ss) {
  const sh=ss.getSheetByName('DATA_CHI_TIET');
  if (!sh) throw new Error('Không thấy DATA_CHI_TIET');
  sh.getRange(1,10,1,7).setValues([['Nội dung','Nhóm','Quy cách','Mức điểm','Thành điểm','SubmissionID','Tạo lúc']]);
  if (!sh.getRange('J2').getFormula()) sh.getRange('J2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,2,FALSE),"")))');
  if (!sh.getRange('K2').getFormula()) sh.getRange('K2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,5,FALSE),"")))');
  if (!sh.getRange('L2').getFormula()) sh.getRange('L2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,3,FALSE),"")))');
  if (!sh.getRange('M2').getFormula()) sh.getRange('M2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,4,FALSE),"")))');
  if (!sh.getRange('N2').getFormula()) sh.getRange('N2').setFormula('=ARRAYFORMULA(IF((M2:M="")+(D2:D=""),"",M2:M*D2:D))');
}

function ensureSheet_(ss,name,headers) {
  let sh=ss.getSheetByName(name);
  if (!sh) sh=ss.insertSheet(name);
  if (sh.getLastRow()===0 || !sh.getRange(1,1).getValue()) sh.getRange(1,1,1,headers.length).setValues([headers]);
  return sh;
}

function hash_(s) {
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8);
  return bytes.map(b=>('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('');
}

function dateText_(v) {
  if (!v) return '';
  const d=new Date(v);
  return isNaN(d.getTime()) ? String(v) : Utilities.formatDate(d,'Asia/Ho_Chi_Minh','dd/MM/yyyy HH:mm');
}

function round1_(n) { return Math.round(Number(n||0)*10)/10; }

function log_(type,msg) {
  try {
    const ss=SpreadsheetApp.openById(SPREADSHEET_ID), sh=ss.getSheetByName('API_LOG');
    if (sh) sh.appendRow([new Date(),type,msg]);
  } catch(e) {}
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
