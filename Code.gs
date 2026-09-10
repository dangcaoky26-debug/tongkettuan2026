/**
 * THI ĐUA TUẦN 2026-2027 - API V3.1 PERFORMANCE
 * Roles: LOP_TRUONG | GVCN | ADMIN
 * Week 1: 05/09/2026 - 11/09/2026
 * One active record per Lớp + Tuần. Resubmission overwrites current record.
 */
const SPREADSHEET_ID = '1iarqsBIYbot9KD0UQAhZcwlQEiJZhSHxQk8NP1496g4';
const API_VERSION = '3.1.0';
const CRITERIA_VERSION = '2026.09.10-56';
const START_SCORE = 200;
const TOKEN_DAYS = 30;
const CLASSES = ['10A','10B','10C','10D','10E','11A','11B','11C','11D','11E','12A','12B','12C','12D','12E','12F','12G'];
const ROLES = ['LOP_TRUONG','GVCN','ADMIN'];
const WEEK_CONTROLS = ['TỰ ĐỘNG','MỞ','KHÓA','KHÔNG TÍNH'];
const REPORT_HEADERS = ['SubmissionID','Cập nhật lúc','Tuần','Lớp','Tổng trừ','Tổng cộng','Tổng điểm','Trạng thái','Tài khoản','Ghi chú','Dòng chi tiết','Số dòng chi tiết','Lượt vi phạm','Lượt khen thưởng','Phiên bản'];
const SUMMARY_HEADERS = ['Tuần','Lớp','GVCN','Điểm nền','Điểm trừ','Điểm cộng','Tổng điểm','Trạng thái','Xếp hạng','Lượt vi phạm','Lượt khen thưởng','Cập nhật lúc'];

function doGet() {
  return json_({ok:true,service:'THI_DUA_TUAN_API',version:API_VERSION,week1:'05/09/2026',criteriaVersion:CRITERIA_VERSION});
}

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const a = String(b.action || '');
    let out;
    if (a === 'login') out = login_(b);
    else if (a === 'leaderHome') out = leaderHomeAction_(b);
    else if (a === 'dashboard') out = dashboard_(b);
    else if (a === 'submit') out = submit_(b);
    else if (a === 'adminDecision') out = adminDecision_(b);
    else if (a === 'adminAccounts') out = adminAccounts_(b);
    else if (a === 'adminUpdateAccount') out = adminUpdateAccount_(b);
    else if (a === 'adminWeeks') out = adminWeeks_(b);
    else if (a === 'adminUpdateWeek') out = adminUpdateWeek_(b);
    else if (a === 'adminAnalytics') out = adminAnalytics_(b);
    else out = {ok:false,error:'UNKNOWN_ACTION'};
    return json_(out);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const known = ['AUTH_REQUIRED','AUTH_INVALID','TOKEN_EXPIRED','ACCOUNT_LOCKED','ROLE_NOT_ALLOWED','INVALID_WEEK','WEEK_LOCKED','WEEK_NOT_COUNTED'];
    if (known.indexOf(msg) >= 0) return json_({ok:false,error:msg});
    log_('ERROR', err && err.stack ? err.stack : msg);
    return json_({ok:false,error:'SERVER_ERROR',message:msg});
  }
}

function setupV31() {
  const ss = ss_();
  ensureSheet_(ss,'TAI_KHOAN',['Tài khoản','MAT_KHAU_HASH','Lớp','Vai trò','Họ tên','Trạng thái','Token','Token hết hạn','Ghi chú']);
  ensureSheet_(ss,'BAO_CAO_TUAN',REPORT_HEADERS);
  ensureSheet_(ss,'TỔNG ĐIỂM',SUMMARY_HEADERS);
  ensureSheet_(ss,'NHAT_KY_BAO_CAO',['Lưu lúc','SubmissionID cũ','Tuần','Lớp','Tổng trừ','Tổng cộng','Tổng điểm','Trạng thái','Tài khoản','Ghi chú','Thay bởi','Lý do']);
  ensureDataColumns_(ss);
  for (let w=1; w<=35; w++) ensureWeekSummary_(ss,w);
  PropertiesService.getScriptProperties().deleteProperty('NEXT_DETAIL_ROW');
  return 'V3.1 ready';
}

function login_(b) {
  const username = normalizeUsername_(b.username);
  const password = String(b.password != null ? b.password : (b.pin != null ? b.pin : '')).trim();
  if (!username || !password) return {ok:false,error:'LOGIN_FAILED'};
  const ss = ss_(), sh = ss.getSheetByName('TAI_KHOAN');
  if (!sh) return {ok:false,error:'SYSTEM_NOT_SETUP'};
  const cell = sh.getRange('A:A').createTextFinder(username).matchEntireCell(true).findNext();
  if (!cell || cell.getRow() < 2) return {ok:false,error:'LOGIN_FAILED'};
  const row = cell.getRow(), v = sh.getRange(row,1,1,9).getValues()[0];
  if (String(v[5] || '') !== 'Hoạt động') return {ok:false,error:'ACCOUNT_LOCKED'};
  if (String(v[1] || '') !== hash_(password)) return {ok:false,error:'LOGIN_FAILED'};
  const role = String(v[3] || 'LOP_TRUONG').toUpperCase();
  const className = String(v[2] || '').trim().toUpperCase();
  if (ROLES.indexOf(role) < 0) return {ok:false,error:'ROLE_INVALID'};
  if (role !== 'ADMIN' && CLASSES.indexOf(className) < 0) return {ok:false,error:'CLASS_NOT_ACTIVE'};

  const oldToken = String(v[6] || '');
  if (oldToken) CacheService.getScriptCache().remove('tok:'+oldToken);
  const token = Utilities.getUuid()+Utilities.getUuid(), exp = new Date(Date.now()+TOKEN_DAYS*86400000);
  sh.getRange(row,7,1,2).setValues([[token,exp]]);
  CacheService.getScriptCache().put('tok:'+token,JSON.stringify({row:row}),21600);

  const u = {username:username,className:className,role:role,displayName:String(v[4] || username),row:row,token:token};
  const out = {ok:true,token:token,username:username,className:className,role:role,displayName:u.displayName,apiVersion:API_VERSION,criteriaVersion:CRITERIA_VERSION};
  if (role === 'LOP_TRUONG') {
    const needCriteria = String(b.criteriaVersion || '') !== CRITERIA_VERSION;
    out.home = leaderHome_(ss,u,needCriteria);
  } else {
    const wi = activeWeekInfo_(ss);
    out.home = role === 'GVCN' ? teacherDashboard_(ss,wi.week,className) : adminDashboard_(ss,wi.week);
    out.weeks = weekList_(ss);
  }
  return out;
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
  const sh = ss_().getSheetByName('TAI_KHOAN');
  if (!sh) throw new Error('AUTH_INVALID');
  let row = 0;
  const cache = CacheService.getScriptCache(), hit = cache.get('tok:'+token);
  if (hit) { try { row = Number(JSON.parse(hit).row || 0); } catch(e) {} }
  if (!row) {
    const cell = sh.getRange('G:G').createTextFinder(token).matchEntireCell(true).findNext();
    if (!cell || cell.getRow() < 2) throw new Error('AUTH_INVALID');
    row = cell.getRow();
    cache.put('tok:'+token,JSON.stringify({row:row}),21600);
  }
  const v = sh.getRange(row,1,1,9).getValues()[0];
  if (String(v[6] || '') !== token) throw new Error('AUTH_INVALID');
  if (String(v[5] || '') !== 'Hoạt động') throw new Error('ACCOUNT_LOCKED');
  const exp = new Date(v[7]);
  if (!v[7] || isNaN(exp.getTime()) || exp.getTime() < Date.now()) throw new Error('TOKEN_EXPIRED');
  const role = String(v[3] || 'LOP_TRUONG').toUpperCase(), className = String(v[2] || '').trim().toUpperCase();
  if (ROLES.indexOf(role) < 0 || (role !== 'ADMIN' && CLASSES.indexOf(className) < 0)) throw new Error('AUTH_INVALID');
  return {username:String(v[0]),className:className,role:role,displayName:String(v[4] || v[0]),row:row,token:token};
}

function leaderHomeAction_(b) {
  const u = auth_(b.token);
  if (u.role !== 'LOP_TRUONG') throw new Error('ROLE_NOT_ALLOWED');
  const includeCriteria = Boolean(b.includeCriteria);
  return {ok:true,home:leaderHome_(ss_(),u,includeCriteria),criteriaVersion:CRITERIA_VERSION};
}

function leaderHome_(ss,u,includeCriteria) {
  const w = activeWeekInfo_(ss), report = readReport_(ss,w.week,u.className);
  const details = report && report.submissionId ? detailsForReport_(ss,report) : [];
  const out = {
    week:w,
    report:report || emptyReport_(w.week,u.className,w.effectiveStatus),
    entries:details.map(function(x){return {code:x.code,qty:x.qty,student:x.student,date:x.dateInput,note:x.note};}),
    canReport:w.canReport,
    criteriaVersion:CRITERIA_VERSION
  };
  if (includeCriteria) out.criteria = criteriaList_(ss);
  return out;
}

function dashboard_(b) {
  const u = auth_(b.token), ss = ss_(), week = validWeek_(b.week || activeWeekInfo_(ss).week);
  if (u.role === 'ADMIN') return adminDashboard_(ss,week);
  if (u.role === 'GVCN') return teacherDashboard_(ss,week,u.className);
  throw new Error('ROLE_NOT_ALLOWED');
}

function submit_(b) {
  const u = auth_(b.token);
  if (u.role !== 'LOP_TRUONG') throw new Error('ROLE_NOT_ALLOWED');
  const ss = ss_(), week = validWeek_(b.week), wi = weekInfo_(ss,week);
  if (!wi.counted) throw new Error('WEEK_NOT_COUNTED');
  if (!wi.canReport) throw new Error('WEEK_LOCKED');
  const entries = Array.isArray(b.entries) ? b.entries : [], crit = criteriaMap_(ss);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const old = readReport_(ss,week,u.className);
    if (old && old.submissionId) {
      archiveReport_(ss,old,u.username,'Gửi lại cùng lớp + tuần');
      markDetailsReplaced_(ss,old);
    }

    ensureDataColumns_(ss);
    const detail = ss.getSheetByName('DATA_CHI_TIET'), now = new Date(), submissionId = Utilities.getUuid();
    let plus=0, minus=0, violations=0, rewards=0;
    const rows=[];
    entries.forEach(function(x){
      const code=String(x.code||'').trim().toUpperCase(), c=crit[code];
      if (!c) throw new Error('Mã tiêu chí không hợp lệ: '+code);
      const qty=Math.floor(Number(x.qty||0));
      if (qty<=0 || qty>500) throw new Error('Số lượng không hợp lệ: '+code);
      const amount=c.point*qty;
      if (amount>=0) { plus+=amount; rewards+=qty; } else { minus+=amount; violations+=qty; }
      let d=now;
      if (x.date) { const p=new Date(String(x.date)+'T12:00:00'); if(!isNaN(p.getTime()))d=p; }
      rows.push({main:[week,u.className,code,qty,String(x.student||''),d,String(x.note||''),'Chờ duyệt',u.username],meta:[submissionId,now]});
    });

    let detailStart=0, detailCount=rows.length;
    if (rows.length) {
      detailStart = reserveDetailRows_(detail,rows.length);
      detail.getRange(detailStart,1,rows.length,9).setValues(rows.map(function(r){return r.main;}));
      detail.getRange(detailStart,15,rows.length,2).setValues(rows.map(function(r){return r.meta;}));
    }

    const score=START_SCORE+plus+minus, rr=reportRow_(week,u.className), reportSheet=ss.getSheetByName('BAO_CAO_TUAN');
    reportSheet.getRange(rr,1,1,15).setValues([[submissionId,now,week,u.className,minus,plus,score,'Chờ duyệt',u.username,String(b.note||''),detailStart,detailCount,violations,rewards,API_VERSION]]);
    updateSummaryClass_(ss,week,u.className);
    invalidateWeekCache_(week);
    log_('SUBMIT',u.username+' '+u.className+' tuần '+week+' = '+score);
    return {ok:true,submissionId:submissionId,score:score,status:'Chờ duyệt',minus:minus,plus:plus,overwritten:Boolean(old&&old.submissionId),home:leaderHome_(ss,u,false)};
  } finally {
    lock.releaseLock();
  }
}

function adminDecision_(b) {
  const u=auth_(b.token);
  if (u.role!=='ADMIN') throw new Error('ROLE_NOT_ALLOWED');
  const week=validWeek_(b.week), className=String(b.className||'').trim().toUpperCase();
  if (CLASSES.indexOf(className)<0) return {ok:false,error:'INVALID_CLASS'};
  const decision=String(b.decision||'');
  if (['Đã duyệt','Từ chối'].indexOf(decision)<0) return {ok:false,error:'INVALID_DECISION'};
  const ss=ss_(), row=reportRow_(week,className), sh=ss.getSheetByName('BAO_CAO_TUAN'), v=sh.getRange(row,1,1,15).getValues()[0];
  if (!v[0]) return {ok:false,error:'SUBMISSION_NOT_FOUND'};
  sh.getRange(row,8).setValue(decision);
  const start=Number(v[10]||0), count=Number(v[11]||0);
  if (start>0 && count>0) ss.getSheetByName('DATA_CHI_TIET').getRange(start,8,count,1).setValue(decision);
  updateSummaryClass_(ss,week,className);
  invalidateWeekCache_(week);
  log_('DECISION',u.username+' '+className+' T'+week+' -> '+decision);
  return {ok:true,status:decision,dashboard:adminDashboard_(ss,week)};
}

function adminDashboard_(ss,week) {
  ensureWeekSummary_(ss,week);
  const rows=weekSummaryRows_(ss,week), wi=weekInfo_(ss,week), pending=[];
  const reportData=ss.getSheetByName('BAO_CAO_TUAN').getRange(reportRow_(week,CLASSES[0]),1,CLASSES.length,15).getValues();
  reportData.forEach(function(r){
    if (r[0] && String(r[7])==='Chờ duyệt') pending.push({className:String(r[3]),score:Number(r[6]),minus:Number(r[4]),plus:Number(r[5]),time:dateText_(r[1]),submissionId:String(r[0])});
  });
  const counted=wi.counted ? rows : [], avg=counted.length ? round1_(counted.reduce(function(s,x){return s+x.score;},0)/counted.length) : 0;
  return {
    ok:true,role:'ADMIN',week:week,weekInfo:wi,
    metrics:{
      submitted:rows.filter(function(x){return x.status!=='Chưa nộp'&&x.status!=='Không tính';}).length,
      pending:rows.filter(function(x){return x.status==='Chờ duyệt';}).length,
      approved:rows.filter(function(x){return x.status==='Đã duyệt';}).length,
      rejected:rows.filter(function(x){return x.status==='Từ chối';}).length,
      notSubmitted:rows.filter(function(x){return x.status==='Chưa nộp';}).length,
      totalClasses:CLASSES.length,
      avgScore:avg
    },
    classes:rows,
    pendingReports:pending
  };
}

function teacherDashboard_(ss,week,className) {
  ensureWeekSummary_(ss,week);
  const wi=weekInfo_(ss,week), summary=summaryRowObject_(ss,week,className), report=readReport_(ss,week,className);
  const details=report&&report.submissionId?detailsForReport_(ss,report):[];
  const weekRows=weekSummaryRows_(ss,week), centerAverage=wi.counted?round1_(weekRows.reduce(function(s,x){return s+x.score;},0)/CLASSES.length):0;
  const startWeek=Math.max(1,week-5), countWeeks=week-startWeek+1, ci=CLASSES.indexOf(className), trend=[];
  const block=ss.getSheetByName('TỔNG ĐIỂM').getRange(summaryRow_(startWeek,CLASSES[0]),1,countWeeks*CLASSES.length,12).getValues();
  for (let w=startWeek; w<=week; w++) {
    const r=block[(w-startWeek)*CLASSES.length+ci];
    if (r&&r[0]) trend.push({week:w,score:Number(r[6]||START_SCORE),rank:Number(r[8]||0),status:String(r[7]||'Chưa nộp')});
  }
  return {ok:true,role:'GVCN',readOnly:true,week:week,weekInfo:wi,className:className,summary:summary,details:details,trend:trend,centerAverage:centerAverage};
}

function adminAnalytics_(b) {
  const u=auth_(b.token);
  if (u.role!=='ADMIN') throw new Error('ROLE_NOT_ALLOWED');
  const ss=ss_(), week=validWeek_(b.week), cache=CacheService.getScriptCache(), key='analytics:'+week, hit=cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch(e) {} }
  const reports=ss.getSheetByName('BAO_CAO_TUAN').getRange(reportRow_(week,CLASSES[0]),1,CLASSES.length,15).getValues();
  const activeIds={};
  reports.forEach(function(r){ if(r[0]) activeIds[String(r[0])]=true; });
  const sh=ss.getSheetByName('DATA_CHI_TIET'), topV={}, topR={};
  if (sh && sh.getLastRow()>=2) {
    const d=sh.getRange(2,1,sh.getLastRow()-1,16).getValues();
    d.forEach(function(r){
      if (!activeIds[String(r[14]||'')] || String(r[7])==='Đã thay thế') return;
      const group=String(r[10]||''), target=group==='VI PHẠM'?topV:(group==='KHEN THƯỞNG'?topR:null);
      if (!target) return;
      const code=String(r[2]), name=String(r[9]||code), qty=Number(r[3]||0), amount=Number(r[13]||0);
      if (!target[code]) target[code]={code:code,name:name,qty:0,amount:0};
      target[code].qty+=qty; target[code].amount+=amount;
    });
  }
  const out={ok:true,week:week,topViolations:Object.values(topV).sort(function(a,b){return b.qty-a.qty;}).slice(0,8),topRewards:Object.values(topR).sort(function(a,b){return b.qty-a.qty;}).slice(0,8)};
  cache.put(key,JSON.stringify(out),30);
  return out;
}

function adminAccounts_(b) {
  const u=auth_(b.token);
  if (u.role!=='ADMIN') throw new Error('ROLE_NOT_ALLOWED');
  const sh=ss_().getSheetByName('TAI_KHOAN'), last=sh.getLastRow();
  if (last<2) return {ok:true,accounts:[]};
  const d=sh.getRange(2,1,last-1,9).getValues(), out=[];
  d.forEach(function(r,i){
    if(r[0]) out.push({row:i+2,username:String(r[0]),className:String(r[2]||''),role:String(r[3]||''),displayName:String(r[4]||''),status:String(r[5]||''),loggedIn:Boolean(r[6])});
  });
  return {ok:true,accounts:out,classes:CLASSES,roles:ROLES};
}

function adminUpdateAccount_(b) {
  const u=auth_(b.token);
  if (u.role!=='ADMIN') throw new Error('ROLE_NOT_ALLOWED');
  const target=String(b.targetUsername||'').trim().toUpperCase();
  if(!target) return {ok:false,error:'ACCOUNT_NOT_FOUND'};
  const ss=ss_(), sh=ss.getSheetByName('TAI_KHOAN'), cell=sh.getRange('A:A').createTextFinder(target).matchEntireCell(true).findNext();
  if(!cell||cell.getRow()<2) return {ok:false,error:'ACCOUNT_NOT_FOUND'};
  const row=cell.getRow(), v=sh.getRange(row,1,1,9).getValues()[0], oldToken=String(v[6]||'');

  const username=String(b.username==null?v[0]:b.username).trim().toUpperCase().replace(/\s+/g,'');
  if(!/^[A-Z0-9_]{3,30}$/.test(username)) return {ok:false,error:'USERNAME_FORMAT'};
  if(username!==target){
    const dup=sh.getRange('A:A').createTextFinder(username).matchEntireCell(true).findNext();
    if(dup&&dup.getRow()!==row) return {ok:false,error:'USERNAME_EXISTS'};
  }

  let role=String(b.role==null?v[3]:b.role).trim().toUpperCase();
  let className=String(b.className==null?v[2]:b.className).trim().toUpperCase();
  if(ROLES.indexOf(role)<0) return {ok:false,error:'ROLE_FORMAT'};
  if(role==='ADMIN') className='ALL';
  else if(CLASSES.indexOf(className)<0) return {ok:false,error:'INVALID_CLASS'};

  const displayName=String(b.displayName==null?v[4]:b.displayName).trim()||username;
  const status=String(b.status==null?v[5]:b.status);
  if(['Hoạt động','Khóa'].indexOf(status)<0) return {ok:false,error:'STATUS_FORMAT'};

  let hash=String(v[1]||''), password=String(b.password||'');
  if(password){
    if(password.length<6||password.length>20) return {ok:false,error:'PASSWORD_FORMAT'};
    hash=hash_(password);
  }
  sh.getRange(row,1,1,9).setValues([[username,hash,className,role,displayName,status,'','',String(v[8]||'')]]);
  if(oldToken) CacheService.getScriptCache().remove('tok:'+oldToken);
  const relogin=target===u.username;
  log_('ACCOUNT',u.username+' cập nhật '+target+' -> '+username+' / '+role+' / '+className);
  return {ok:true,username:username,reLogin:relogin};
}

function adminWeeks_(b) {
  const u=auth_(b.token);
  if(u.role!=='ADMIN') throw new Error('ROLE_NOT_ALLOWED');
  return {ok:true,weeks:weekList_(ss_())};
}

function adminUpdateWeek_(b) {
  const u=auth_(b.token);
  if(u.role!=='ADMIN') throw new Error('ROLE_NOT_ALLOWED');
  const week=validWeek_(b.week), control=String(b.control||'').toUpperCase();
  if(WEEK_CONTROLS.indexOf(control)<0) return {ok:false,error:'WEEK_CONTROL_FORMAT'};
  const ss=ss_(), sh=ss.getSheetByName('LỊCH TUẦN');
  if(control==='MỞ'){
    const controls=sh.getRange(2,4,35,1).getValues();
    let changed=false;
    for(let i=0;i<controls.length;i++){
      if(i!==week-1 && String(controls[i][0]).toUpperCase()==='MỞ'){controls[i][0]='TỰ ĐỘNG';changed=true;}
    }
    if(changed) sh.getRange(2,4,35,1).setValues(controls);
  }
  sh.getRange(week+1,4).setValue(control);
  sh.getRange(week+1,7).setValue(String(b.note||''));
  sh.getRange(week+1,8,1,2).setValues([[u.username,new Date()]]);
  updateWeekSummaryStatus_(ss,week);
  invalidateWeekCache_(week);
  log_('WEEK',u.username+' T'+week+' -> '+control);
  return {ok:true,weekInfo:weekInfo_(ss,week),weeks:weekList_(ss),dashboard:adminDashboard_(ss,week)};
}

function weekList_(ss) {
  const sh=ss.getSheetByName('LỊCH TUẦN');
  if(!sh) return [];
  const d=sh.getRange(2,1,35,9).getValues(), out=[];
  d.forEach(function(r){if(r[0])out.push(weekObjectFromRow_(r));});
  return out;
}

function weekInfo_(ss,week) {
  const sh=ss.getSheetByName('LỊCH TUẦN');
  if(!sh) throw new Error('INVALID_WEEK');
  const r=sh.getRange(week+1,1,1,9).getValues()[0];
  if(Number(r[0])!==week) throw new Error('INVALID_WEEK');
  return weekObjectFromRow_(r);
}

function weekObjectFromRow_(r) {
  const week=Number(r[0]), start=new Date(r[1]), end=new Date(r[2]), control=String(r[3]||'TỰ ĐỘNG').toUpperCase();
  const todayKey=ymdKey_(new Date()), startKey=ymdKey_(start), endKey=ymdKey_(end);
  let status='Chưa mở', counted=true, canReport=false;
  if(control==='KHÔNG TÍNH'){status='Không tính';counted=false;}
  else if(control==='MỞ'){status='Đang mở';canReport=true;}
  else if(control==='KHÓA'){status='Đã khóa';}
  else if(todayKey<startKey){status='Chưa mở';}
  else if(todayKey>endKey){status='Đã khóa';}
  else{status='Đang mở';canReport=true;}
  return {week:week,start:dateOnlyText_(start),end:dateOnlyText_(end),control:control,effectiveStatus:status,counted:counted,canReport:canReport,note:String(r[6]||''),updatedBy:String(r[7]||''),updatedAt:dateText_(r[8])};
}

function activeWeekInfo_(ss) {
  const list=weekList_(ss);
  if(!list.length) throw new Error('INVALID_WEEK');
  const manual=list.filter(function(x){return x.control==='MỞ'&&x.canReport;});
  if(manual.length) return manual[manual.length-1];
  const automatic=list.filter(function(x){return x.control==='TỰ ĐỘNG'&&x.canReport;});
  if(automatic.length) return automatic[automatic.length-1];
  const today=ymdKey_(new Date());
  for(let i=0;i<list.length;i++){
    const s=ymdKey_(parseDMY_(list[i].start)), e=ymdKey_(parseDMY_(list[i].end));
    if(today>=s&&today<=e) return list[i];
  }
  if(today<ymdKey_(parseDMY_(list[0].start))) return list[0];
  for(let i=list.length-1;i>=0;i--) if(list[i].counted) return list[i];
  return list[list.length-1];
}

function reportRow_(week,className) {
  const i=CLASSES.indexOf(className);
  if(i<0) return 0;
  return 2+(week-1)*CLASSES.length+i;
}
function summaryRow_(week,className) { return reportRow_(week,className); }

function readReport_(ss,week,className) {
  const sh=ss.getSheetByName('BAO_CAO_TUAN'), row=reportRow_(week,className);
  if(!sh||row<2) return null;
  const r=sh.getRange(row,1,1,15).getValues()[0];
  if(!r[0]) return null;
  return {submissionId:String(r[0]),time:new Date(r[1]),week:Number(r[2]),className:String(r[3]),minus:Number(r[4]||0),plus:Number(r[5]||0),score:Number(r[6]||START_SCORE),status:String(r[7]||'Chờ duyệt'),username:String(r[8]||''),note:String(r[9]||''),detailStart:Number(r[10]||0),detailCount:Number(r[11]||0),violations:Number(r[12]||0),rewards:Number(r[13]||0),version:String(r[14]||'')};
}

function emptyReport_(week,className,status) {
  return {submissionId:'',week:week,className:className,minus:0,plus:0,score:START_SCORE,status:status==='Không tính'?'Không tính':'Chưa nộp',violations:0,rewards:0,time:null};
}

function detailsForReport_(ss,report) {
  if(!report.detailStart||!report.detailCount) return [];
  const d=ss.getSheetByName('DATA_CHI_TIET').getRange(report.detailStart,1,report.detailCount,16).getValues(), out=[];
  d.forEach(function(r){
    if(String(r[14])===report.submissionId) out.push({code:String(r[2]),qty:Number(r[3]||0),student:String(r[4]||''),date:dateText_(r[5]),dateInput:dateInput_(r[5]),note:String(r[6]||''),status:String(r[7]||''),name:String(r[9]||r[2]),group:String(r[10]||''),unit:String(r[11]||''),point:Number(r[12]||0),amount:Number(r[13]||0)});
  });
  return out;
}

function archiveReport_(ss,r,replacedBy,reason) {
  const sh=ss.getSheetByName('NHAT_KY_BAO_CAO');
  if(sh) sh.appendRow([new Date(),r.submissionId,r.week,r.className,r.minus,r.plus,r.score,r.status,r.username,r.note,replacedBy,reason]);
}

function markDetailsReplaced_(ss,r) {
  if(r.detailStart&&r.detailCount) ss.getSheetByName('DATA_CHI_TIET').getRange(r.detailStart,8,r.detailCount,1).setValue('Đã thay thế');
}

function updateSummaryClass_(ss,week,className) {
  ensureWeekSummary_(ss,week);
  const sh=ss.getSheetByName('TỔNG ĐIỂM'), wi=weekInfo_(ss,week), r=readReport_(ss,week,className), gv=gvcnForClass_(ss,className), row=summaryRow_(week,className);
  const has=Boolean(r&&r.submissionId), status=!wi.counted?'Không tính':(has?r.status:'Chưa nộp');
  sh.getRange(row,1,1,12).setValues([[week,className,gv,START_SCORE,has?r.minus:0,has?r.plus:0,has?r.score:START_SCORE,status,'',has?r.violations:0,has?r.rewards:0,has?r.time:new Date()]]);
  recalcRanks_(ss,week);
}

function ensureWeekSummary_(ss,week) {
  const sh=ss.getSheetByName('TỔNG ĐIỂM'), start=summaryRow_(week,CLASSES[0]);
  if(!sh.getRange(start,1).getValue()){
    const wi=weekInfo_(ss,week), g=gvcnMap_(ss);
    const rows=CLASSES.map(function(c){return [week,c,g[c]||'',START_SCORE,0,0,START_SCORE,wi.counted?'Chưa nộp':'Không tính','',0,0,new Date()];});
    sh.getRange(start,1,CLASSES.length,12).setValues(rows);
    recalcRanks_(ss,week);
  }
}

function updateWeekSummaryStatus_(ss,week) {
  ensureWeekSummary_(ss,week);
  const wi=weekInfo_(ss,week), reports=ss.getSheetByName('BAO_CAO_TUAN').getRange(reportRow_(week,CLASSES[0]),1,CLASSES.length,15).getValues();
  const sh=ss.getSheetByName('TỔNG ĐIỂM'), start=summaryRow_(week,CLASSES[0]), block=sh.getRange(start,1,CLASSES.length,12).getValues();
  for(let i=0;i<CLASSES.length;i++){
    block[i][7]=!wi.counted?'Không tính':(reports[i][0]?String(reports[i][7]||'Chờ duyệt'):'Chưa nộp');
  }
  sh.getRange(start,1,CLASSES.length,12).setValues(block);
  recalcRanks_(ss,week);
}

function recalcRanks_(ss,week) {
  const sh=ss.getSheetByName('TỔNG ĐIỂM'), start=summaryRow_(week,CLASSES[0]), d=sh.getRange(start,7,CLASSES.length,2).getValues();
  const eligible=d.map(function(r,i){return {idx:i,score:Number(r[0]||START_SCORE),status:String(r[1]||'')};}).filter(function(x){return x.status!=='Không tính';});
  const vals=d.map(function(){return [''];});
  eligible.forEach(function(x){ vals[x.idx][0]=1+eligible.filter(function(y){return y.score>x.score;}).length; });
  sh.getRange(start,9,CLASSES.length,1).setValues(vals);
}

function weekSummaryRows_(ss,week) {
  ensureWeekSummary_(ss,week);
  const wi=weekInfo_(ss,week), start=summaryRow_(week,CLASSES[0]);
  const d=ss.getSheetByName('TỔNG ĐIỂM').getRange(start,1,CLASSES.length,12).getValues();
  return d.map(function(r){return {week:Number(r[0]),className:String(r[1]),gvcn:String(r[2]||''),base:Number(r[3]||START_SCORE),minus:Number(r[4]||0),plus:Number(r[5]||0),score:Number(r[6]||START_SCORE),status:String(r[7]||'Chưa nộp'),rank:Number(r[8]||0),violations:Number(r[9]||0),rewards:Number(r[10]||0),updated:dateText_(r[11]),weekCounted:wi.counted};});
}

function summaryRowObject_(ss,week,className) {
  ensureWeekSummary_(ss,week);
  const r=ss.getSheetByName('TỔNG ĐIỂM').getRange(summaryRow_(week,className),1,1,12).getValues()[0];
  return {week:Number(r[0]),className:String(r[1]),gvcn:String(r[2]||''),base:Number(r[3]||START_SCORE),minus:Number(r[4]||0),plus:Number(r[5]||0),score:Number(r[6]||START_SCORE),status:String(r[7]||'Chưa nộp'),rank:Number(r[8]||0),violations:Number(r[9]||0),rewards:Number(r[10]||0),updated:dateText_(r[11])};
}

function gvcnMap_(ss) {
  const cache=CacheService.getScriptCache(), key='gvcn-map-v1', hit=cache.get(key);
  if(hit){try{return JSON.parse(hit);}catch(e){}}
  const sh=ss.getSheetByName('CAU_HINH'), m={};
  if(sh){
    const d=sh.getRange(2,2,17,4).getValues();
    d.forEach(function(r){if(r[0])m[String(r[0])]=String(r[3]||'');});
  }
  cache.put(key,JSON.stringify(m),600);
  return m;
}
function gvcnForClass_(ss,className) { return gvcnMap_(ss)[className] || ''; }

function criteriaList_(ss) {
  const cache=CacheService.getScriptCache(), key='criteria:'+CRITERIA_VERSION, hit=cache.get(key);
  if(hit){try{return JSON.parse(hit);}catch(e){}}
  const sh=ss.getSheetByName('DM_TIEU_CHI'), d=sh.getDataRange().getValues(), out=[];
  for(let r=1;r<d.length;r++) if(d[r][0]) out.push({code:String(d[r][0]),name:String(d[r][1]),unit:String(d[r][2]),point:Number(d[r][3]),group:String(d[r][4])});
  cache.put(key,JSON.stringify(out),21600);
  return out;
}
function criteriaMap_(ss){const m={};criteriaList_(ss).forEach(function(c){m[c.code]=c;});return m;}

function reserveDetailRows_(sh,count) {
  const props=PropertiesService.getScriptProperties();
  let row=Number(props.getProperty('NEXT_DETAIL_ROW')||0);
  if(row<2 || row>sh.getMaxRows()+1 || sh.getRange(Math.min(row,sh.getMaxRows()),1).getValue()!==''){
    const max=sh.getMaxRows(), vals=sh.getRange(2,1,max-1,1).getValues();
    row=2;
    for(let i=vals.length-1;i>=0;i--) if(vals[i][0]!==''){row=i+3;break;}
  }
  if(row+count-1>sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(),Math.max(500,row+count-1-sh.getMaxRows()));
  props.setProperty('NEXT_DETAIL_ROW',String(row+count));
  return row;
}

function ensureDataColumns_(ss) {
  const sh=ss.getSheetByName('DATA_CHI_TIET');
  if(!sh) throw new Error('Không thấy DATA_CHI_TIET');
  sh.getRange(1,10,1,7).setValues([['Nội dung','Nhóm','Quy cách','Mức điểm','Thành điểm','SubmissionID','Tạo lúc']]);
  if(!sh.getRange('J2').getFormula()) sh.getRange('J2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,2,FALSE),"")))');
  if(!sh.getRange('K2').getFormula()) sh.getRange('K2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,5,FALSE),"")))');
  if(!sh.getRange('L2').getFormula()) sh.getRange('L2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,3,FALSE),"")))');
  if(!sh.getRange('M2').getFormula()) sh.getRange('M2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,4,FALSE),"")))');
  if(!sh.getRange('N2').getFormula()) sh.getRange('N2').setFormula('=ARRAYFORMULA(IF((M2:M="")+(D2:D=""),"",M2:M*D2:D))');
}

function invalidateWeekCache_(week) {
  const c=CacheService.getScriptCache();
  c.remove('analytics:'+week);
}

function validWeek_(w){w=Math.floor(Number(w));if(w<1||w>35)throw new Error('INVALID_WEEK');return w;}
function ss_(){return SpreadsheetApp.openById(SPREADSHEET_ID);}
function ensureSheet_(ss,name,headers){let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(!sh.getRange(1,1).getValue())sh.getRange(1,1,1,headers.length).setValues([headers]);return sh;}
function hash_(s){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8);return bytes.map(function(b){return('0'+((b<0?b+256:b).toString(16))).slice(-2);}).join('');}
function dateText_(v){if(!v)return'';const d=new Date(v);return isNaN(d.getTime())?String(v):Utilities.formatDate(d,'Asia/Ho_Chi_Minh','dd/MM/yyyy HH:mm');}
function dateOnlyText_(v){if(!v)return'';const d=new Date(v);return isNaN(d.getTime())?String(v):Utilities.formatDate(d,'Asia/Ho_Chi_Minh','dd/MM/yyyy');}
function dateInput_(v){if(!v)return'';const d=new Date(v);return isNaN(d.getTime())?'':Utilities.formatDate(d,'Asia/Ho_Chi_Minh','yyyy-MM-dd');}
function parseDMY_(s){const p=String(s||'').split('/');return p.length===3?new Date(Number(p[2]),Number(p[1])-1,Number(p[0])):new Date(s);}
function ymdKey_(d){return Utilities.formatDate(new Date(d),'Asia/Ho_Chi_Minh','yyyyMMdd');}
function round1_(n){return Math.round(Number(n||0)*10)/10;}
function log_(type,msg){try{const sh=ss_().getSheetByName('API_LOG');if(sh)sh.appendRow([new Date(),type,msg]);}catch(e){}}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
