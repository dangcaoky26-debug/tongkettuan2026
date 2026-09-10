from pathlib import Path

p = Path('Code.gs')
s = p.read_text(encoding='utf-8')

if "const API_VERSION = '3.1.1';" in s and 'syncIssuedPasswordForLogin_' in s:
    print('Code.gs already patched')
    raise SystemExit(0)

s = s.replace("const API_VERSION = '3.1.0';", "const API_VERSION = '3.1.1';")

old = """  const row = cell.getRow(), v = sh.getRange(row,1,1,9).getValues()[0];
  if (String(v[5] || '') !== 'Hoạt động') return {ok:false,error:'ACCOUNT_LOCKED'};
  if (String(v[1] || '') !== hash_(password)) return {ok:false,error:'LOGIN_FAILED'};
  const role = String(v[3] || 'LOP_TRUONG').toUpperCase();
"""
new = """  const row = cell.getRow(), v = sh.getRange(row,1,1,9).getValues()[0];
  if (String(v[5] || '') !== 'Hoạt động') return {ok:false,error:'ACCOUNT_LOCKED'};

  // PHAT_TAI_KHOAN is the user-managed password source. If it was edited
  // directly in the Sheet, synchronize the hash before validating login.
  syncIssuedPasswordForLogin_(ss,username,sh,row,v);
  if (String(v[1] || '') !== hash_(password)) return {ok:false,error:'LOGIN_FAILED'};
  const role = String(v[3] || 'LOP_TRUONG').toUpperCase();
"""
if old not in s:
    raise SystemExit('login patch target not found')
s = s.replace(old, new)

old2 = """  sh.getRange(row,1,1,9).setValues([[username,hash,className,role,displayName,status,'','',String(v[8]||'')]]);
  if(oldToken) CacheService.getScriptCache().remove('tok:'+oldToken);
  const relogin=target===u.username;
"""
new2 = """  sh.getRange(row,1,1,9).setValues([[username,hash,className,role,displayName,status,'','',String(v[8]||'')]]);
  if(oldToken) CacheService.getScriptCache().remove('tok:'+oldToken);
  syncIssuedAccountRow_(ss,target,username,password,className,role,displayName);
  const relogin=target===u.username;
"""
if old2 not in s:
    raise SystemExit('admin patch target not found')
s = s.replace(old2, new2)

helpers = r'''

/**
 * Đồng bộ mật khẩu khi chỉnh trực tiếp PHAT_TAI_KHOAN.
 * Login cũng tự đồng bộ lại để hoạt động cả khi web app không chạy trigger onEdit.
 */
function onEdit(e) {
  try {
    if(!e || !e.range) return;
    const range=e.range, sh=range.getSheet();
    if(sh.getName()!=='PHAT_TAI_KHOAN') return;
    if(range.getLastColumn()<2 || range.getColumn()>2 || range.getLastRow()<2) return;
    const start=Math.max(2,range.getRow()), end=range.getLastRow();
    syncIssuedPasswordRows_(sh,start,end);
  } catch(err) {
    log_('PASSWORD_SYNC',String(err&&err.message?err.message:err));
  }
}

function syncIssuedPasswordRows_(issuedSheet,startRow,endRow) {
  const ss=issuedSheet.getParent(), accountSheet=ss.getSheetByName('TAI_KHOAN');
  if(!accountSheet) return;
  const rows=issuedSheet.getRange(startRow,1,endRow-startRow+1,2).getDisplayValues();
  rows.forEach(function(r){
    const username=normalizeUsername_(r[0]), password=String(r[1]||'').trim();
    if(!username || !password) return;
    const cell=accountSheet.getRange('A:A').createTextFinder(username).matchEntireCell(true).findNext();
    if(!cell || cell.getRow()<2) return;
    const ar=cell.getRow(), oldToken=String(accountSheet.getRange(ar,7).getValue()||'');
    accountSheet.getRange(ar,2).setValue(hash_(password));
    accountSheet.getRange(ar,7,1,2).clearContent();
    if(oldToken) CacheService.getScriptCache().remove('tok:'+oldToken);
  });
}

function syncIssuedPasswordForLogin_(ss,username,accountSheet,accountRow,accountValues) {
  const issued=ss.getSheetByName('PHAT_TAI_KHOAN');
  if(!issued || issued.getLastRow()<2) return;
  const cell=issued.getRange('A:A').createTextFinder(username).matchEntireCell(true).findNext();
  if(!cell || cell.getRow()<2) return;
  const password=String(issued.getRange(cell.getRow(),2).getDisplayValue()||'').trim();
  if(!password) return;
  const newHash=hash_(password);
  if(String(accountValues[1]||'')===newHash) return;
  const oldToken=String(accountValues[6]||'');
  accountSheet.getRange(accountRow,2).setValue(newHash);
  accountSheet.getRange(accountRow,7,1,2).clearContent();
  if(oldToken) CacheService.getScriptCache().remove('tok:'+oldToken);
  accountValues[1]=newHash;
  accountValues[6]='';
  accountValues[7]='';
}

function syncIssuedAccountRow_(ss,oldUsername,newUsername,password,className,role,displayName) {
  const issued=ss.getSheetByName('PHAT_TAI_KHOAN');
  if(!issued) return;
  let cell=issued.getRange('A:A').createTextFinder(oldUsername).matchEntireCell(true).findNext();
  if(!cell) cell=issued.getRange('A:A').createTextFinder(newUsername).matchEntireCell(true).findNext();
  if(!cell || cell.getRow()<2) return;
  const row=cell.getRow();
  issued.getRange(row,1).setValue(newUsername);
  if(password) issued.getRange(row,2).setNumberFormat('@').setValue(String(password));
  issued.getRange(row,3).setValue(role==='ADMIN'?'ALL':className);
  if(issued.getMaxColumns()>=4 && displayName){
    const oldNote=String(issued.getRange(row,4).getValue()||'');
    if(!oldNote) issued.getRange(row,4).setValue(role==='ADMIN'?'Tài khoản quản trị':(role==='GVCN'?'GVCN '+displayName:'Lớp trưởng '+className));
  }
}

function syncAllIssuedPasswords_() {
  const ss=ss_(), issued=ss.getSheetByName('PHAT_TAI_KHOAN');
  if(!issued) return 'Không thấy PHAT_TAI_KHOAN';
  issued.getRange('B2:B'+issued.getMaxRows()).setNumberFormat('@');
  if(issued.getLastRow()>=2) syncIssuedPasswordRows_(issued,2,issued.getLastRow());
  return 'Đã đồng bộ mật khẩu';
}
'''

needle = '\nfunction invalidateWeekCache_(week) {'
if needle not in s:
    raise SystemExit('helper insert target not found')
s = s.replace(needle, helpers + needle)

p.write_text(s, encoding='utf-8')
print('Patched Code.gs to API 3.1.1')
