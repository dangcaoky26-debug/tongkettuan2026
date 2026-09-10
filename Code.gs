/**
 * THI ĐUA TUẦN 2026-2027 - API V2.0
 * Roles: LOP_TRUONG | GVCN | ADMIN
 */
const SPREADSHEET_ID='1iarqsBIYbot9KD0UQAhZcwlQEiJZhSHxQk8NP1496g4';
const START_SCORE=200;
const TOKEN_DAYS=30;
const CLASSES=['10A','10B','10C','10D','10E','11A','11B','11C','11D','11E','12A','12B','12C','12D','12E','12F','12G'];

function doGet(){return json_({ok:true,service:'THI_DUA_TUAN_API',version:'2.0.0'});}
function doPost(e){
  try{
    const b=JSON.parse((e&&e.postData&&e.postData.contents)||'{}'),a=String(b.action||'');
    if(a==='login')return json_(login_(b));
    if(a==='criteria')return json_(criteria_(b));
    if(a==='weekStatus')return json_(weekStatus_(b));
    if(a==='submit')return json_(submit_(b));
    if(a==='changePin')return json_(changePin_(b));
    if(a==='dashboard')return json_(dashboard_(b));
    if(a==='adminDecision')return json_(adminDecision_(b));
    if(a==='syncWeek')return json_(syncWeekAction_(b));
    return json_({ok:false,error:'UNKNOWN_ACTION'});
  }catch(err){log_('ERROR',err&&err.stack?err.stack:String(err));return json_({ok:false,error:'SERVER_ERROR',message:String(err&&err.message?err.message:err)});}
}
function setupSystem(){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureDataColumns_(ss);
  ensureSheet_(ss,'TAI_KHOAN',['Tài khoản','PIN_HASH','Lớp','Vai trò','Họ tên','Trạng thái','Token','Token hết hạn','Đổi PIN']);
  ensureSheet_(ss,'PHAT_TAI_KHOAN',['Tài khoản','PIN tạm','Lớp','Ghi chú']);
  ensureSheet_(ss,'BAO_CAO_TUAN',['SubmissionID','Thời gian','Tuần','Lớp','Tổng trừ','Tổng cộng','Tổng điểm','Trạng thái','Tài khoản','Ghi chú']);
  ensureSheet_(ss,'API_LOG',['Thời gian','Loại','Nội dung']);
  ensureSheet_(ss,'TỔNG ĐIỂM',['Tuần','Lớp','GVCN','Điểm nền','Điểm trừ','Điểm cộng','Tổng điểm','Trạng thái','Xếp hạng','Lượt vi phạm','Lượt khen thưởng','Cập nhật lúc']);
  for(let w=1;w<=35;w++)syncWeekSummary_(ss,w);
  return 'Đã đồng bộ hệ thống V2.0.';
}
function login_(b){
  const username=normalizeUsername_(b.username),pin=String(b.pin||'').trim();
  if(!username||!pin)return{ok:false,error:'LOGIN_FAILED'};
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('TAI_KHOAN');if(!sh)return{ok:false,error:'SYSTEM_NOT_SETUP'};
  const d=sh.getDataRange().getValues();
  for(let r=1;r<d.length;r++){
    if(String(d[r][0]).toUpperCase()!==username)continue;
    if(String(d[r][5])!=='Hoạt động'||String(d[r][1])!==hash_(pin))return{ok:false,error:'LOGIN_FAILED'};
    const role=String(d[r][3]||'LOP_TRUONG').toUpperCase(),className=String(d[r][2]||'').trim().toUpperCase();
    if(role!=='ADMIN'&&!CLASSES.includes(className))return{ok:false,error:'CLASS_NOT_ACTIVE'};
    const token=Utilities.getUuid()+Utilities.getUuid(),exp=new Date(Date.now()+TOKEN_DAYS*86400000);
    sh.getRange(r+1,7,1,2).setValues([[token,exp]]);SpreadsheetApp.flush();
    return{ok:true,token,className,role,displayName:String(d[r][4]||username),mustChangePin:Boolean(d[r][8])};
  }
  return{ok:false,error:'LOGIN_FAILED'};
}
function normalizeUsername_(v){
  let s=String(v||'').trim().toUpperCase().replace(/\s+/g,'').replace(/-/g,'');
  if(/^((10[A-E])|(11[A-E])|(12[A-G]))$/.test(s))s='LT'+s;
  if(/^((10[A-E])|(11[A-E])|(12[A-G]))_LT$/.test(s))s='LT'+s.replace('_LT','');
  if(/^GVCN((10[A-E])|(11[A-E])|(12[A-G]))$/.test(s))s='GV'+s.slice(4);
  return s;
}
function auth_(token){
  token=String(token||'');if(!token)throw new Error('AUTH_REQUIRED');
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('TAI_KHOAN');if(!sh)throw new Error('SYSTEM_NOT_SETUP');
  const d=sh.getDataRange().getValues();
  for(let r=1;r<d.length;r++)if(String(d[r][6])===token){
    const exp=new Date(d[r][7]);if(!exp||isNaN(exp.getTime())||exp.getTime()<Date.now())throw new Error('TOKEN_EXPIRED');
    const role=String(d[r][3]||'LOP_TRUONG').toUpperCase(),className=String(d[r][2]||'').trim().toUpperCase();
    if(role!=='ADMIN'&&!CLASSES.includes(className))throw new Error('CLASS_NOT_ACTIVE');
    return{username:String(d[r][0]),className,role,displayName:String(d[r][4]||d[r][0])};
  }
  throw new Error('AUTH_INVALID');
}
function criteria_(b){
  auth_(b.token);const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('DM_TIEU_CHI');if(!sh)throw new Error('MISSING_CRITERIA_SHEET');
  const d=sh.getDataRange().getValues(),out=[];for(let r=1;r<d.length;r++)if(d[r][0])out.push({code:String(d[r][0]),name:String(d[r][1]),unit:String(d[r][2]),point:Number(d[r][3]),group:String(d[r][4])});
  return{ok:true,criteria:out,startScore:START_SCORE};
}
function weekStatus_(b){const u=auth_(b.token),week=validWeek_(b.week);if(u.role==='ADMIN')return{ok:false,error:'ROLE_NOT_ALLOWED'};return latestWeekStatus_(SpreadsheetApp.openById(SPREADSHEET_ID),week,u.className);}
function submit_(b){
  const u=auth_(b.token);if(u.role!=='LOP_TRUONG')return{ok:false,error:'ROLE_NOT_ALLOWED'};
  const week=validWeek_(b.week),entries=Array.isArray(b.entries)?b.entries:[],ss=SpreadsheetApp.openById(SPREADSHEET_ID);ensureDataColumns_(ss);
  const crit=criteriaMap_(ss),report=ss.getSheetByName('BAO_CAO_TUAN'),detail=ss.getSheetByName('DATA_CHI_TIET');if(!report||!detail)throw new Error('Thiếu sheet dữ liệu');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const rd=report.getDataRange().getValues();for(let r=rd.length-1;r>=1;r--)if(Number(rd[r][2])===week&&String(rd[r][3])===u.className){const st=String(rd[r][7]);if(st==='Đã duyệt')return{ok:false,error:'WEEK_LOCKED'};if(st==='Chờ duyệt')report.getRange(r+1,8).setValue('Đã thay thế');}
    markOldDetails_(detail,week,u.className);
    const submissionId=Utilities.getUuid(),now=new Date();let plus=0,minus=0;const rows=[];
    entries.forEach(x=>{const code=String(x.code||'').trim().toUpperCase(),c=crit[code];if(!c)throw new Error('Mã tiêu chí không hợp lệ: '+code);const qty=Math.floor(Number(x.qty||0));if(qty<=0||qty>500)throw new Error('Số lượng không hợp lệ: '+code);const amount=c.point*qty;amount>=0?plus+=amount:minus+=amount;const date=x.date?new Date(x.date+'T12:00:00'):now;rows.push({main:[week,u.className,code,qty,String(x.student||''),date,String(x.note||''),'Chờ duyệt',u.username],meta:[submissionId,now]});});
    if(rows.length){const start=nextDetailRow_(detail);detail.getRange(start,1,rows.length,9).setValues(rows.map(r=>r.main));detail.getRange(start,15,rows.length,2).setValues(rows.map(r=>r.meta));}
    const score=START_SCORE+plus+minus;report.appendRow([submissionId,now,week,u.className,minus,plus,score,'Chờ duyệt',u.username,String(b.note||'')]);SpreadsheetApp.flush();syncWeekSummary_(ss,week);log_('SUBMIT',u.username+' '+u.className+' tuần '+week+' = '+score);
    return{ok:true,submissionId,score,status:'Chờ duyệt',minus,plus};
  }finally{lock.releaseLock();}
}
function dashboard_(b){
  const u=auth_(b.token),week=validWeek_(b.week||1),ss=SpreadsheetApp.openById(SPREADSHEET_ID);syncWeekSummary_(ss,week);
  if(u.role==='ADMIN')return adminDashboard_(ss,week);
  if(u.role==='GVCN')return teacherDashboard_(ss,week,u.className);
  return{ok:false,error:'ROLE_NOT_ALLOWED'};
}
function adminDashboard_(ss,week){
  const rows=weekSummaryRows_(ss,week),report=ss.getSheetByName('BAO_CAO_TUAN'),pendingReports=[];
  if(report&&report.getLastRow()>1){const d=report.getDataRange().getValues();for(let r=d.length-1;r>=1;r--)if(Number(d[r][2])===week&&String(d[r][7])==='Chờ duyệt')pendingReports.push({submissionId:String(d[r][0]),time:dateText_(d[r][1]),week,className:String(d[r][3]),minus:Number(d[r][4]),plus:Number(d[r][5]),score:Number(d[r][6]),username:String(d[r][8])});}
  return{ok:true,role:'ADMIN',week,metrics:{submitted:rows.filter(x=>x.status!=='Chưa nộp').length,pending:rows.filter(x=>x.status==='Chờ duyệt').length,approved:rows.filter(x=>x.status==='Đã duyệt').length,notSubmitted:rows.filter(x=>x.status==='Chưa nộp').length,totalClasses:CLASSES.length,avgScore:round1_(rows.reduce((s,x)=>s+x.score,0)/CLASSES.length)},classes:rows,pendingReports,topViolations:topCriteria_(ss,week,'VI PHẠM',8),topRewards:topCriteria_(ss,week,'KHEN THƯỞNG',6)};
}
function teacherDashboard_(ss,week,className){
  const rows=weekSummaryRows_(ss,week),row=rows.find(x=>x.className===className)||{className,score:200,minus:0,plus:0,status:'Chưa nộp',rank:1,violations:0,rewards:0},details=latestDetails_(ss,week,className),trend=[];
  for(let w=Math.max(1,week-5);w<=week;w++){syncWeekSummary_(ss,w);const rr=weekSummaryRows_(ss,w).find(x=>x.className===className);if(rr)trend.push({week:w,score:rr.score,rank:rr.rank,status:rr.status});}
  return{ok:true,role:'GVCN',week,className,summary:row,details,trend,centerAverage:round1_(rows.reduce((s,x)=>s+x.score,0)/CLASSES.length)};
}
function adminDecision_(b){
  const u=auth_(b.token);if(u.role!=='ADMIN')return{ok:false,error:'ROLE_NOT_ALLOWED'};
  const id=String(b.submissionId||''),decision=String(b.decision||'');if(!id||!['Đã duyệt','Từ chối'].includes(decision))return{ok:false,error:'INVALID_DECISION'};
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID),report=ss.getSheetByName('BAO_CAO_TUAN'),detail=ss.getSheetByName('DATA_CHI_TIET'),rd=report.getDataRange().getValues();let week=0,found=false;
  for(let r=1;r<rd.length;r++)if(String(rd[r][0])===id){week=Number(rd[r][2]);report.getRange(r+1,8).setValue(decision);found=true;break;}if(!found)return{ok:false,error:'SUBMISSION_NOT_FOUND'};
  if(detail&&detail.getLastRow()>1){const ids=detail.getRange(2,15,detail.getLastRow()-1,1).getValues(),statusRange=detail.getRange(2,8,ids.length,1),vals=statusRange.getValues();let changed=false;for(let i=0;i<ids.length;i++)if(String(ids[i][0])===id){vals[i][0]=decision;changed=true;}if(changed)statusRange.setValues(vals);}
  SpreadsheetApp.flush();syncWeekSummary_(ss,week);log_('DECISION',u.username+' '+id+' -> '+decision);return{ok:true,status:decision,week};
}
function syncWeekAction_(b){const u=auth_(b.token);if(u.role!=='ADMIN')return{ok:false,error:'ROLE_NOT_ALLOWED'};const week=validWeek_(b.week),ss=SpreadsheetApp.openById(SPREADSHEET_ID);syncWeekSummary_(ss,week);return{ok:true,week};}
function syncWeekSummary_(ss,week){
  const sh=ensureSheet_(ss,'TỔNG ĐIỂM',['Tuần','Lớp','GVCN','Điểm nền','Điểm trừ','Điểm cộng','Tổng điểm','Trạng thái','Xếp hạng','Lượt vi phạm','Lượt khen thưởng','Cập nhật lúc']),gvcn=gvcnMap_(ss),latest=latestReportsMap_(ss,week),now=new Date(),pre=[];
  CLASSES.forEach(c=>{const r=latest[c],valid=r&&r.status!=='Từ chối',score=valid?Number(r.score):START_SCORE,minus=valid?Number(r.minus):0,plus=valid?Number(r.plus):0,counts=r?detailCountsBySubmission_(ss,r.id):{violations:0,rewards:0};pre.push({className:c,gvcn:gvcn[c]||'',score,minus,plus,status:r?r.status:'Chưa nộp',violations:counts.violations,rewards:counts.rewards,time:r?r.time:now});});
  pre.forEach(x=>x.rank=1+pre.filter(y=>y.score>x.score).length);
  const start=2+(week-1)*CLASSES.length;sh.getRange(start,1,CLASSES.length,12).setValues(pre.map(x=>[week,x.className,x.gvcn,START_SCORE,x.minus,x.plus,x.score,x.status,x.rank,x.violations,x.rewards,x.time]));sh.getRange(1,1,1,12).setValues([['Tuần','Lớp','GVCN','Điểm nền','Điểm trừ','Điểm cộng','Tổng điểm','Trạng thái','Xếp hạng','Lượt vi phạm','Lượt khen thưởng','Cập nhật lúc']]);sh.setFrozenRows(1);
}
function weekSummaryRows_(ss,week){const sh=ss.getSheetByName('TỔNG ĐIỂM'),start=2+(week-1)*CLASSES.length;if(!sh||sh.getLastRow()<start)return[];return sh.getRange(start,1,CLASSES.length,12).getValues().map(r=>({week:Number(r[0]),className:String(r[1]),gvcn:String(r[2]||''),base:Number(r[3]),minus:Number(r[4]),plus:Number(r[5]),score:Number(r[6]),status:String(r[7]),rank:Number(r[8]),violations:Number(r[9]),rewards:Number(r[10]),updated:dateText_(r[11])}));}
function latestReportsMap_(ss,week){const sh=ss.getSheetByName('BAO_CAO_TUAN'),m={};if(!sh||sh.getLastRow()<2)return m;const d=sh.getDataRange().getValues();for(let r=d.length-1;r>=1;r--){const c=String(d[r][3]),st=String(d[r][7]);if(Number(d[r][2])!==week||!CLASSES.includes(c)||st==='Đã thay thế'||m[c])continue;m[c]={id:String(d[r][0]),time:new Date(d[r][1]),minus:Number(d[r][4]),plus:Number(d[r][5]),score:Number(d[r][6]),status:st};}return m;}
function latestWeekStatus_(ss,week,className){const r=latestReportsMap_(ss,week)[className];return r?{ok:true,status:r.status,score:r.score,submissionId:r.id,minus:r.minus,plus:r.plus}:{ok:true,status:null,score:START_SCORE};}
function latestDetails_(ss,week,className){const r=latestReportsMap_(ss,week)[className];if(!r)return[];const sh=ss.getSheetByName('DATA_CHI_TIET');if(!sh||sh.getLastRow()<2)return[];const d=sh.getRange(2,1,sh.getLastRow()-1,16).getValues(),out=[];for(let i=0;i<d.length;i++)if(String(d[i][14])===r.id)out.push({code:String(d[i][2]),qty:Number(d[i][3]),student:String(d[i][4]||''),date:dateText_(d[i][5]),note:String(d[i][6]||''),status:String(d[i][7]),name:String(d[i][9]||''),group:String(d[i][10]||''),point:Number(d[i][12]),amount:Number(d[i][13])});return out;}
function detailCountsBySubmission_(ss,id){const sh=ss.getSheetByName('DATA_CHI_TIET');let violations=0,rewards=0;if(!sh||sh.getLastRow()<2)return{violations,rewards};const d=sh.getRange(2,4,sh.getLastRow()-1,12).getValues();for(let i=0;i<d.length;i++)if(String(d[i][11])===id){const q=Number(d[i][0]||0),g=String(d[i][7]||'');if(g==='VI PHẠM')violations+=q;else if(g==='KHEN THƯỞNG')rewards+=q;}return{violations,rewards};}
function topCriteria_(ss,week,group,limit){const sh=ss.getSheetByName('DATA_CHI_TIET'),m={};if(!sh||sh.getLastRow()<2)return[];const d=sh.getRange(2,1,sh.getLastRow()-1,14).getValues();for(let i=0;i<d.length;i++){if(Number(d[i][0])!==week||String(d[i][10])!==group||!['Chờ duyệt','Đã duyệt'].includes(String(d[i][7])))continue;const code=String(d[i][2]),qty=Number(d[i][3]||0);if(!m[code])m[code]={code,name:String(d[i][9]||code),qty:0,amount:0};m[code].qty+=qty;m[code].amount+=Number(d[i][13]||0);}return Object.values(m).sort((a,b)=>b.qty-a.qty).slice(0,limit);}
function gvcnMap_(ss){const sh=ss.getSheetByName('CAU_HINH'),m={};if(!sh)return m;sh.getRange(2,2,17,4).getValues().forEach(r=>{if(r[0])m[String(r[0])]=String(r[3]||'');});return m;}
function changePin_(b){const u=auth_(b.token),pin=String(b.newPin||'').trim();if(!/^\d{6}$/.test(pin))return{ok:false,error:'PIN_FORMAT'};const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('TAI_KHOAN'),d=sh.getDataRange().getValues();for(let r=1;r<d.length;r++)if(String(d[r][0])===u.username){sh.getRange(r+1,2).setValue(hash_(pin));sh.getRange(r+1,9).setValue(false);return{ok:true};}return{ok:false,error:'ACCOUNT_NOT_FOUND'};}
function validWeek_(w){w=Math.floor(Number(w));if(w<1||w>35)throw new Error('INVALID_WEEK');return w;}
function criteriaMap_(ss){const sh=ss.getSheetByName('DM_TIEU_CHI'),d=sh.getDataRange().getValues(),m={};for(let r=1;r<d.length;r++)if(d[r][0])m[String(d[r][0]).trim().toUpperCase()]={name:String(d[r][1]),unit:String(d[r][2]),point:Number(d[r][3]),group:String(d[r][4])};return m;}
function markOldDetails_(sh,week,lop){if(sh.getLastRow()<2)return;const d=sh.getRange(2,1,sh.getLastRow()-1,16).getValues();for(let r=0;r<d.length;r++)if(Number(d[r][0])===week&&String(d[r][1])===lop&&String(d[r][7])==='Chờ duyệt')sh.getRange(r+2,8).setValue('Đã thay thế');}
function nextDetailRow_(sh){const last=sh.getLastRow();if(last<2)return 2;const a=sh.getRange(2,1,Math.max(1,last-1),1).getValues();for(let i=a.length-1;i>=0;i--)if(a[i][0]!=='')return i+3;return 2;}
function ensureDataColumns_(ss){const sh=ss.getSheetByName('DATA_CHI_TIET');if(!sh)throw new Error('Không thấy DATA_CHI_TIET');sh.getRange(1,10,1,7).setValues([['Nội dung','Nhóm','Quy cách','Mức điểm','Thành điểm','SubmissionID','Tạo lúc']]);if(!sh.getRange('J2').getFormula())sh.getRange('J2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,2,FALSE),"")))');if(!sh.getRange('K2').getFormula())sh.getRange('K2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,5,FALSE),"")))');if(!sh.getRange('L2').getFormula())sh.getRange('L2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,3,FALSE),"")))');if(!sh.getRange('M2').getFormula())sh.getRange('M2').setFormula('=ARRAYFORMULA(IF(C2:C="","",IFNA(VLOOKUP(C2:C,DM_TIEU_CHI!A:E,4,FALSE),"")))');if(!sh.getRange('N2').getFormula())sh.getRange('N2').setFormula('=ARRAYFORMULA(IF((M2:M="")+(D2:D=""),"",M2:M*D2:D))');}
function ensureSheet_(ss,name,headers){let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(sh.getLastRow()===0||!sh.getRange(1,1).getValue())sh.getRange(1,1,1,headers.length).setValues([headers]);return sh;}
function hash_(s){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8);return bytes.map(b=>('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('');}
function dateText_(v){if(!v)return'';const d=new Date(v);return isNaN(d.getTime())?String(v):Utilities.formatDate(d,'Asia/Ho_Chi_Minh','dd/MM/yyyy HH:mm');}
function round1_(n){return Math.round(Number(n||0)*10)/10;}
function log_(type,msg){try{const ss=SpreadsheetApp.openById(SPREADSHEET_ID),sh=ss.getSheetByName('API_LOG');if(sh)sh.appendRow([new Date(),type,msg]);}catch(e){}}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
