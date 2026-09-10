const S = {
  session:null,
  week:1,
  criteria:[],
  entries:{},
  tab:'VI PHẠM',
  screen:'login',
  data:null,
  query:'',
  accountQuery:'',
  accountRole:'ALL',
  busy:false
};

const pending = new Map();
let seq = 1;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function version(){ try { return Android.getAppVersion(); } catch(e){ return 'web'; } }
function toast(msg){ const t=$('#toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.remove('show'),3200); }
function api(payload, timeout=50000){
  return new Promise(resolve=>{
    const id='r'+seq++;
    const tm=setTimeout(()=>{pending.delete(id);resolve({ok:false,error:'TIMEOUT',message:'Kết nối quá thời gian'});},timeout);
    pending.set(id,{resolve,tm});
    try { Android.apiRequest(id,JSON.stringify(payload)); }
    catch(e){ clearTimeout(tm); pending.delete(id); resolve({ok:false,error:'NETWORK_ERROR',message:String(e)}); }
  });
}
window.__androidApiResponse=(id,raw)=>{
  const p=pending.get(id); if(!p)return;
  pending.delete(id); clearTimeout(p.tm);
  try { p.resolve(JSON.parse(raw)); }
  catch(e){ p.resolve({ok:false,error:'BAD_JSON',message:'Phản hồi không hợp lệ'}); }
};

function err(r){
  const e=String(r&&r.error||'');
  if(e==='LOGIN_FAILED')return'Sai tài khoản hoặc mật khẩu';
  if(e==='ACCOUNT_DISABLED')return'Tài khoản đã bị khóa';
  if(e==='HTML_RESPONSE')return'Web App chưa mở quyền truy cập Anyone';
  if(e==='TIMEOUT')return'Kết nối quá chậm';
  if(e==='WEEK_LOCKED')return'Tuần này đã được duyệt, không thể gửi lại';
  if(e==='ROLE_NOT_ALLOWED')return'Tài khoản không có quyền thực hiện thao tác này';
  if(e==='PASSWORD_FORMAT')return'Mật khẩu mới phải từ 6 đến 32 ký tự';
  if(e==='AUTH_INVALID'||e==='TOKEN_EXPIRED')return'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại';
  return r&&r.message?String(r.message):('Lỗi '+e);
}

function weeks(){ return Array.from({length:35},(_,i)=>`<option value="${i+1}" ${S.week===i+1?'selected':''}>Tuần ${i+1}</option>`).join(''); }
function roleName(r){ return r==='ADMIN'?'Quản trị':r==='GVCN'?'Giáo viên chủ nhiệm':'Lớp trưởng'; }
function statusClass(s){ return s==='Đã duyệt'?'statusGood':s==='Chờ duyệt'?'statusWait':s==='Từ chối'?'statusBad':'statusMute'; }
function signed(n){ n=Number(n||0); return n>0?`+${n}`:`${n}`; }

function setBusy(v){ S.busy=v; $$('.btn,button').forEach(b=>{ if(b.id!=='logoutBtn') b.disabled=!!v; }); }
function logout(){ S.session=null;S.criteria=[];S.entries={};S.data=null;S.screen='login';S.query='';render(); }
function header(title,sub){ return `<header class="top"><div class="brandWrap"><div class="brand">${esc(title)}</div><div class="muted small">${esc(sub||'')}</div></div><button class="mini danger" id="logoutBtn">Đăng xuất</button></header>`; }

function loginView(){
  return `<main class="shell login">
    <div class="loginMark">✓</div>
    <h1>Thi đua tuần</h1>
    <p class="muted">Lớp trưởng · Giáo viên chủ nhiệm · Quản trị</p>
    <section class="card loginCard">
      <label>Tài khoản</label>
      <input id="user" class="input" placeholder="LT12G / GV12G / ADMIN" autocapitalize="characters" autocomplete="username">
      <label>Mật khẩu</label>
      <input id="password" class="input" type="password" maxlength="32" placeholder="Nhập mật khẩu" autocomplete="current-password">
      <button id="loginBtn" class="btn primary">Đăng nhập</button>
      <div class="helper">Lớp trưởng có thể nhập <b>12G</b> hoặc <b>LT12G</b>. GVCN dùng <b>GV12G</b> hoặc <b>GVCN12G</b>.</div>
    </section>
    <p class="tiny muted center">Phiên bản ${esc(version())}</p>
  </main>`;
}

async function login(){
  const username=($('#user')?.value||'').trim();
  const password=$('#password')?.value||'';
  if(!username||!password)return toast('Nhập đầy đủ tài khoản và mật khẩu');
  setBusy(true);
  const r=await api({action:'login',username,password});
  setBusy(false);
  if(!r.ok)return toast(err(r));
  S.session=r; S.week=1; S.entries={}; S.data=null; S.query='';
  await routeByRole();
}

async function routeByRole(){
  if(!S.session)return;
  if(S.session.role==='LOP_TRUONG'){
    S.screen='leader';
    await loadCriteria();
    await loadLeader();
  }else if(S.session.role==='GVCN'){
    S.screen='teacher';
    await loadDashboard();
  }else if(S.session.role==='ADMIN'){
    S.screen='admin';
    await loadDashboard();
  }else{
    toast('Vai trò tài khoản không hợp lệ'); logout(); return;
  }
  render();
}

async function loadCriteria(){
  const r=await api({action:'criteria',token:S.session.token});
  if(r.ok) S.criteria=r.criteria||[];
  else { S.criteria=[]; S.data={loadError:err(r)}; }
}
async function loadLeader(){
  const r=await api({action:'weekStatus',token:S.session.token,week:S.week});
  S.data=r.ok?r:{ok:false,loadError:err(r)};
}
async function loadDashboard(){
  const r=await api({action:'dashboard',token:S.session.token,week:S.week},65000);
  S.data=r.ok?r:{ok:false,loadError:err(r)};
}

function entry(code){
  if(!S.entries[code]) S.entries[code]={qty:0,student:'',date:new Date().toISOString().slice(0,10),note:''};
  return S.entries[code];
}
function calc(){
  let plus=0,minus=0,violationQty=0,rewardQty=0,selected=0;
  S.criteria.forEach(c=>{const e=entry(c.code);if(e.qty>0){selected++;const a=Number(c.point)*e.qty;if(a>=0){plus+=a;rewardQty+=e.qty;}else{minus+=a;violationQty+=e.qty;}}});
  return {plus,minus,violationQty,rewardQty,selected,score:200+plus+minus};
}
function hasDraft(){ return Object.values(S.entries).some(e=>Number(e.qty)>0); }

function leaderView(){
  const d=S.data||{}, t=calc();
  const locked=d.status==='Đã duyệt';
  const shown=hasDraft()?t.score:(d.score??200);
  const currentMinus=hasDraft()?t.minus:(d.minus??0);
  const currentPlus=hasDraft()?t.plus:(d.plus??0);
  const existing=Array.isArray(d.details)?d.details:[];
  return `<main class="shell">
    ${header('Báo cáo thi đua · '+S.session.className,S.session.displayName)}
    <section class="card weekCard"><div><span class="eyebrow">Tuần báo cáo</span><select id="weekSel">${weeks()}</select></div><span class="pill ${statusClass(d.status)}">${esc(d.status||'Chưa nộp')}</span></section>
    <section class="heroCard">
      <div><span>Điểm tạm tính</span><strong>${shown}</strong><small>Điểm nền 200</small></div>
      <div class="heroMeta"><span>Điểm trừ <b class="bad">${currentMinus}</b></span><span>Điểm cộng <b class="good">+${currentPlus}</b></span></div>
    </section>
    ${d.loadError?`<section class="notice badBox">${esc(d.loadError)} <button id="retryLeader" class="textBtn">Tải lại</button></section>`:''}
    ${locked?`<section class="notice goodBox"><b>Báo cáo tuần ${S.week} đã được duyệt.</b><br>Trang nhập đã khóa. Có thể xem lại nội dung phía dưới.</section>`:''}
    ${d.status==='Chờ duyệt'?`<section class="notice waitBox">Báo cáo đang chờ Admin duyệt. Nếu gửi lại, báo cáo mới sẽ thay thế bản đang chờ.</section>`:''}
    ${existing.length?existingReport(existing):''}
    ${!locked?leaderEditor(t):''}
  </main>`;
}

function existingReport(details){
  return `<section class="card"><div class="sectionHead"><div><span class="eyebrow">Báo cáo đã gửi</span><h3>Nội dung hiện tại</h3></div><span class="countBadge">${details.length} mục</span></div>
    <div class="compactList">${details.map(v=>`<div class="compactItem"><div><span class="miniTag ${v.group==='VI PHẠM'?'tagBad':'tagGood'}">${v.group==='VI PHẠM'?'Vi phạm':'Khen thưởng'}</span><b>${esc(v.name||v.code)}</b><small>${v.student?esc(v.student)+' · ':''}${esc(v.date||'')}${v.note?' · '+esc(v.note):''}</small></div><strong class="${v.amount<0?'bad':'good'}">${signed(v.amount)}</strong></div>`).join('')}</div>
  </section>`;
}

function leaderEditor(t){
  return `<section class="stats4">
    <div><span>Mục đã chọn</span><b>${t.selected}</b></div><div><span>Lượt vi phạm</span><b class="bad">${t.violationQty}</b></div><div><span>Lượt khen</span><b class="good">${t.rewardQty}</b></div><div><span>Điểm sau báo cáo</span><b>${t.score}</b></div>
  </section>
  <section class="card criteriaCard">
    <div class="sectionHead"><div><span class="eyebrow">Nội dung báo cáo</span><h3>Chọn tiêu chí phát sinh</h3></div></div>
    <div class="tabs"><button class="tab ${S.tab==='VI PHẠM'?'active dangerTab':''}" data-tab="VI PHẠM">Vi phạm</button><button class="tab ${S.tab==='KHEN THƯỞNG'?'active goodTab':''}" data-tab="KHEN THƯỞNG">Khen thưởng</button></div>
    <input id="search" class="input" placeholder="Tìm theo mã hoặc nội dung..." value="${esc(S.query)}">
    <div id="criteriaList" class="criteriaList">${criteriaHtml(S.query)}</div>
  </section>
  <div class="stickyBar"><div><span>Điểm dự kiến</span><b>${t.score}</b></div><button id="previewBtn" class="btn primary">Xem trước & gửi</button></div>`;
}

function criteriaHtml(q){
  const query=String(q||'').trim().toLowerCase();
  const list=S.criteria.filter(c=>c.group===S.tab && (!query||c.name.toLowerCase().includes(query)||c.code.toLowerCase().includes(query)));
  if(!list.length)return `<div class="empty">Không tìm thấy tiêu chí phù hợp.</div>`;
  return list.map(c=>{
    const e=entry(c.code), active=e.qty>0;
    return `<article class="criterion ${active?'selected':''}">
      <div class="criterionMain">
        <div class="criterionText"><div><span class="code">${esc(c.code)}</span><span class="point ${c.point<0?'bad':'good'}">${signed(c.point)} đ/${esc(c.unit||'lần')}</span></div><b>${esc(c.name)}</b></div>
        <div class="stepper"><button data-step="${c.code}" data-delta="-1">−</button><span>${e.qty}</span><button data-step="${c.code}" data-delta="1">+</button></div>
      </div>
      ${active?`<div class="detailFields"><input class="input" data-field="${c.code}" data-key="student" placeholder="Học viên/tập thể liên quan" value="${esc(e.student)}"><div class="two"><input class="input" type="date" data-field="${c.code}" data-key="date" value="${esc(e.date)}"><input class="input" data-field="${c.code}" data-key="note" placeholder="Ghi chú cụ thể" value="${esc(e.note)}"></div></div>`:''}
    </article>`;
  }).join('');
}

function previewView(){
  const chosen=S.criteria.filter(c=>entry(c.code).qty>0), t=calc();
  return `<main class="shell">
    ${header('Xác nhận báo cáo','Lớp '+S.session.className+' · Tuần '+S.week)}
    <section class="heroCard compactHero"><div><span>Tổng điểm</span><strong>${t.score}</strong><small>${t.minus} điểm trừ · +${t.plus} điểm cộng</small></div></section>
    <section class="card"><div class="sectionHead"><div><span class="eyebrow">Kiểm tra trước khi gửi</span><h3>${chosen.length?chosen.length+' tiêu chí đã chọn':'Không có phát sinh'}</h3></div></div>
      ${chosen.length?chosen.map(c=>{const e=entry(c.code),amount=c.point*e.qty;return `<div class="reviewItem"><div><span class="code">${c.code}</span><b>${esc(c.name)}</b><small>${e.qty} × ${signed(c.point)}${e.student?' · '+esc(e.student):''}${e.date?' · '+esc(e.date):''}${e.note?' · '+esc(e.note):''}</small></div><strong class="${amount<0?'bad':'good'}">${signed(amount)}</strong></div>`}).join(''):`<div class="empty">Báo cáo sẽ giữ nguyên 200 điểm.</div>`}
    </section>
    <button id="submitBtn" class="btn primary">Gửi báo cáo tuần ${S.week}</button>
    <button id="backBtn" class="btn ghost">Quay lại chỉnh sửa</button>
  </main>`;
}

async function submitReport(){
  const entries=S.criteria.filter(c=>entry(c.code).qty>0).map(c=>({code:c.code,...entry(c.code)}));
  const replace=S.data&&S.data.status==='Chờ duyệt';
  if(!confirm(replace?'Gửi lại sẽ thay thế báo cáo đang chờ duyệt. Tiếp tục?':'Gửi báo cáo tuần '+S.week+'?'))return;
  setBusy(true);
  const r=await api({action:'submit',token:S.session.token,week:S.week,entries});
  setBusy(false);
  if(!r.ok)return toast(err(r));
  S.entries={}; S.screen='leader'; await loadLeader(); render(); toast('Đã gửi · TỔNG ĐIỂM cập nhật '+r.score+' điểm');
}

function teacherView(){
  const d=S.data||{}, x=d.summary||{}, issues=d.issueSummary||[], rewards=d.rewardSummary||[], people=d.people||[], details=d.details||[], trend=d.trend||[];
  if(d.loadError)return `<main class="shell">${header('GVCN · '+S.session.className,S.session.displayName)}<section class="notice badBox">${esc(d.loadError)}</section><button id="retryDash" class="btn primary">Tải lại</button></main>`;
  return `<main class="shell">
    ${header('GVCN · '+S.session.className,S.session.displayName)}
    <section class="readonlyBanner">Chế độ chỉ xem · Giáo viên chủ nhiệm không thể sửa dữ liệu thi đua</section>
    <section class="card weekCard"><div><span class="eyebrow">Tuần xem</span><select id="weekSel">${weeks()}</select></div><span class="pill ${statusClass(x.status)}">${esc(x.status||'Chưa nộp')}</span></section>
    <section class="heroCard"><div><span>Điểm lớp</span><strong>${x.score??200}</strong><small>Hạng ${x.rank||'-'}/17 · Trung bình Trung tâm ${d.centerAverage??200}</small></div><div class="heroMeta"><span>Điểm trừ <b class="bad">${x.minus??0}</b></span><span>Điểm cộng <b class="good">+${x.plus??0}</b></span></div></section>
    <section class="stats4"><div><span>Lượt vi phạm</span><b class="bad">${x.violations??0}</b></div><div><span>Lượt khen thưởng</span><b class="good">${x.rewards??0}</b></div><div><span>Nhóm vi phạm</span><b>${issues.length}</b></div><div><span>Người được ghi nhận</span><b>${people.length}</b></div></section>
    ${teacherSituation(issues,rewards,people)}
    <section class="card"><div class="sectionHead"><div><span class="eyebrow">Chi tiết báo cáo</span><h3>Tình hình lớp tuần ${S.week}</h3></div><span class="countBadge">${details.length} mục</span></div>
      ${details.length?details.map(detailCard).join(''):`<div class="empty">Lớp chưa có báo cáo trong tuần này.</div>`}
    </section>
    <section class="card"><div class="sectionHead"><div><span class="eyebrow">Theo dõi</span><h3>Xu hướng gần đây</h3></div></div><div class="trend">${trend.map(v=>`<div><span>T${v.week}</span><b>${v.score}</b><small>#${v.rank}</small></div>`).join('')}</div></section>
  </main>`;
}

function teacherSituation(issues,rewards,people){
  return `<section class="card"><div class="sectionHead"><div><span class="eyebrow">Tổng quan</span><h3>Các nội dung cần theo dõi</h3></div></div>
    <div class="splitCols"><div><h4 class="bad">Vi phạm nổi bật</h4>${issues.length?issues.slice(0,6).map(x=>`<div class="summaryRow"><span>${esc(x.name)}</span><b>${x.qty} lượt</b></div>`).join(''):`<div class="empty smallEmpty">Không có vi phạm.</div>`}</div>
    <div><h4 class="good">Khen thưởng</h4>${rewards.length?rewards.slice(0,6).map(x=>`<div class="summaryRow"><span>${esc(x.name)}</span><b>${x.qty} lượt</b></div>`).join(''):`<div class="empty smallEmpty">Chưa có khen thưởng.</div>`}</div></div>
    ${people.length?`<div class="peopleBlock"><h4>Học viên/tập thể được ghi nhận</h4>${people.map(p=>`<div class="personRow"><b>${esc(p.name)}</b><span>${p.violations?`Vi phạm ${p.violations}`:''}${p.violations&&p.rewards?' · ':''}${p.rewards?`Khen ${p.rewards}`:''}</span><strong class="${p.net<0?'bad':'good'}">${signed(p.net)}</strong></div>`).join('')}</div>`:''}
  </section>`;
}

function detailCard(v){
  return `<article class="detailCard"><div class="detailTop"><span class="miniTag ${v.group==='VI PHẠM'?'tagBad':'tagGood'}">${v.group==='VI PHẠM'?'Vi phạm':'Khen thưởng'}</span><span class="code">${esc(v.code)}</span><strong class="${v.amount<0?'bad':'good'}">${signed(v.amount)}</strong></div><b>${esc(v.name||v.code)}</b><div class="detailMeta"><span>Số lượng: <b>${v.qty}</b></span>${v.student?`<span>Đối tượng: <b>${esc(v.student)}</b></span>`:''}${v.date?`<span>Ngày: <b>${esc(v.date)}</b></span>`:''}${v.note?`<span>Ghi chú: <b>${esc(v.note)}</b></span>`:''}</div></article>`;
}

function adminView(){
  const d=S.data||{}, m=d.metrics||{}, rows=d.classes||[], pendingReports=d.pendingReports||[], accounts=d.accounts||[];
  if(d.loadError)return `<main class="shell wide">${header('Quản trị thi đua',S.session.displayName)}<section class="notice badBox">${esc(d.loadError)}</section><button id="retryDash" class="btn primary">Tải lại</button></main>`;
  return `<main class="shell wide">
    ${header('Quản trị thi đua',S.session.displayName)}
    <section class="card weekCard"><div><span class="eyebrow">Tuần thống kê</span><select id="weekSel">${weeks()}</select></div><span class="pill statusMute">API ${esc(S.session.apiVersion||'')}</span></section>
    <section class="kpis"><div><span>Đã nộp</span><b>${m.submitted??0}/17</b></div><div><span>Chờ duyệt</span><b>${m.pending??0}</b></div><div><span>Đã duyệt</span><b>${m.approved??0}</b></div><div><span>Điểm TB</span><b>${m.avgScore??200}</b></div></section>
    <section class="card"><div class="sectionHead"><div><span class="eyebrow">Toàn Trung tâm</span><h3>Xếp hạng tuần ${S.week}</h3></div></div><div class="rankTable">${rows.map(x=>`<div class="rankRow"><span class="rankNo">#${x.rank}</span><b>${x.className}</b><span>${esc(x.gvcn||'Chưa có GVCN')}</span><strong>${x.score}</strong><span class="pill ${statusClass(x.status)}">${esc(x.status)}</span></div>`).join('')}</div></section>
    <section class="card"><div class="sectionHead"><div><span class="eyebrow">Xử lý</span><h3>Báo cáo chờ duyệt</h3></div><span class="countBadge">${pendingReports.length}</span></div>${pendingReports.length?pendingReports.map(p=>`<div class="pendingCard"><div><b>${p.className} · ${p.score} điểm</b><small>${esc(p.time)} · ${p.minus} / +${p.plus}</small></div><div class="actionRow"><button class="mini primary" data-approve="${p.submissionId}">Duyệt</button><button class="mini danger" data-reject="${p.submissionId}">Từ chối</button></div></div>`).join(''):`<div class="empty">Không có báo cáo chờ duyệt.</div>`}</section>
    <section class="card"><div class="splitCols"><div><h3>Vi phạm nhiều</h3>${(d.topViolations||[]).map(x=>`<div class="summaryRow"><span>${esc(x.name)}</span><b>${x.qty}</b></div>`).join('')||'<div class="empty smallEmpty">Chưa có dữ liệu</div>'}</div><div><h3>Khen thưởng nhiều</h3>${(d.topRewards||[]).map(x=>`<div class="summaryRow"><span>${esc(x.name)}</span><b>${x.qty}</b></div>`).join('')||'<div class="empty smallEmpty">Chưa có dữ liệu</div>'}</div></div></section>
    ${accountManager(accounts)}
  </main>`;
}

function accountManager(accounts){
  const q=S.accountQuery.toLowerCase();
  const filtered=accounts.filter(a=>(S.accountRole==='ALL'||a.role===S.accountRole) && (!q||a.username.toLowerCase().includes(q)||a.displayName.toLowerCase().includes(q)||a.className.toLowerCase().includes(q)));
  return `<section class="card"><div class="sectionHead"><div><span class="eyebrow">Bảo mật</span><h3>Quản lý tài khoản & mật khẩu</h3></div><span class="countBadge">${accounts.length} tài khoản</span></div>
    <div class="accountFilters"><input id="accountSearch" class="input" placeholder="Tìm tài khoản, tên, lớp..." value="${esc(S.accountQuery)}"><select id="accountRole"><option value="ALL" ${S.accountRole==='ALL'?'selected':''}>Tất cả vai trò</option><option value="LOP_TRUONG" ${S.accountRole==='LOP_TRUONG'?'selected':''}>Lớp trưởng</option><option value="GVCN" ${S.accountRole==='GVCN'?'selected':''}>GVCN</option><option value="ADMIN" ${S.accountRole==='ADMIN'?'selected':''}>Admin</option></select></div>
    <div id="accountList" class="accountList">${accountRows(filtered)}</div>
    <p class="helper">Admin đặt mật khẩu mới sẽ có hiệu lực ngay; phiên đăng nhập cũ của tài khoản đó sẽ bị hủy.</p>
  </section>`;
}
function accountRows(list){
  if(!list.length)return '<div class="empty">Không tìm thấy tài khoản.</div>';
  return list.map(a=>`<div class="accountRow"><div><b>${esc(a.username)}</b><span>${esc(a.displayName)}</span><small>${esc(roleName(a.role))}${a.className&&a.className!=='ALL'?' · Lớp '+esc(a.className):''}</small></div><span class="pill ${a.status==='Hoạt động'?'statusGood':'statusBad'}">${esc(a.status)}</span><button class="mini ghost" data-password="${esc(a.username)}" data-name="${esc(a.displayName)}">Đặt mật khẩu</button></div>`).join('');
}

async function decision(id,status){
  if(!confirm(status==='Đã duyệt'?'Duyệt báo cáo này?':'Từ chối báo cáo này?'))return;
  setBusy(true); const r=await api({action:'adminDecision',token:S.session.token,submissionId:id,decision:status}); setBusy(false);
  if(!r.ok)return toast(err(r));
  await loadDashboard(); render(); toast('Đã cập nhật: '+status);
}

function openPasswordModal(username,name){
  const wrap=document.createElement('div');
  wrap.className='modalWrap'; wrap.id='passwordModal';
  wrap.innerHTML=`<div class="modal"><span class="eyebrow">Admin</span><h3>Đặt mật khẩu mới</h3><p><b>${esc(username)}</b><br><span class="muted">${esc(name||'')}</span></p><label>Mật khẩu mới</label><input id="newPassword" class="input" type="password" maxlength="32" placeholder="6–32 ký tự"><label>Nhập lại mật khẩu</label><input id="confirmPassword" class="input" type="password" maxlength="32" placeholder="Nhập lại"><button id="savePassword" class="btn primary">Cập nhật ngay</button><button id="closePassword" class="btn ghost">Hủy</button></div>`;
  document.body.appendChild(wrap);
  $('#closePassword').onclick=()=>wrap.remove();
  $('#savePassword').onclick=()=>savePassword(username);
}

async function savePassword(username){
  const p=$('#newPassword').value, c=$('#confirmPassword').value;
  if(p.length<6||p.length>32)return toast('Mật khẩu phải từ 6 đến 32 ký tự');
  if(p!==c)return toast('Hai lần nhập mật khẩu chưa khớp');
  setBusy(true); const r=await api({action:'adminSetPassword',token:S.session.token,username,newPassword:p}); setBusy(false);
  if(!r.ok)return toast(err(r));
  $('#passwordModal')?.remove();
  if(r.selfChanged){ alert('Mật khẩu Admin đã đổi. Vui lòng đăng nhập lại bằng mật khẩu mới.'); logout(); return; }
  toast('Đã cập nhật mật khẩu cho '+r.username);
}

function bindCommon(){
  if($('#logoutBtn'))$('#logoutBtn').onclick=logout;
  if($('#weekSel'))$('#weekSel').onchange=async e=>{S.week=Number(e.target.value);S.entries={};if(S.screen==='leader')await loadLeader();else await loadDashboard();render();};
  if($('#retryLeader'))$('#retryLeader').onclick=async()=>{await loadCriteria();await loadLeader();render();};
  if($('#retryDash'))$('#retryDash').onclick=async()=>{await loadDashboard();render();};
}

function bindLeader(){
  $$('[data-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;S.query='';render();});
  $$('[data-step]').forEach(b=>b.onclick=()=>{const e=entry(b.dataset.step);e.qty=Math.max(0,Math.min(500,e.qty+Number(b.dataset.delta)));render();});
  $$('[data-field]').forEach(i=>i.onchange=()=>{entry(i.dataset.field)[i.dataset.key]=i.value;});
  if($('#search'))$('#search').oninput=e=>{S.query=e.target.value;$('#criteriaList').innerHTML=criteriaHtml(S.query);bindCriteriaOnly();};
  if($('#previewBtn'))$('#previewBtn').onclick=()=>{S.screen='preview';render();};
}
function bindCriteriaOnly(){
  $$('[data-step]').forEach(b=>b.onclick=()=>{const e=entry(b.dataset.step);e.qty=Math.max(0,Math.min(500,e.qty+Number(b.dataset.delta)));render();});
  $$('[data-field]').forEach(i=>i.onchange=()=>{entry(i.dataset.field)[i.dataset.key]=i.value;});
}
function bindPreview(){ if($('#backBtn'))$('#backBtn').onclick=()=>{S.screen='leader';render();}; if($('#submitBtn'))$('#submitBtn').onclick=submitReport; }
function bindAdmin(){
  $$('[data-approve]').forEach(b=>b.onclick=()=>decision(b.dataset.approve,'Đã duyệt'));
  $$('[data-reject]').forEach(b=>b.onclick=()=>decision(b.dataset.reject,'Từ chối'));
  $$('[data-password]').forEach(b=>b.onclick=()=>openPasswordModal(b.dataset.password,b.dataset.name));
  if($('#accountSearch'))$('#accountSearch').oninput=e=>{S.accountQuery=e.target.value;const list=(S.data&&S.data.accounts)||[];const q=S.accountQuery.toLowerCase();const filtered=list.filter(a=>(S.accountRole==='ALL'||a.role===S.accountRole)&&(!q||a.username.toLowerCase().includes(q)||a.displayName.toLowerCase().includes(q)||a.className.toLowerCase().includes(q)));$('#accountList').innerHTML=accountRows(filtered);$$('[data-password]').forEach(b=>b.onclick=()=>openPasswordModal(b.dataset.password,b.dataset.name));};
  if($('#accountRole'))$('#accountRole').onchange=e=>{S.accountRole=e.target.value;render();};
}

function render(){
  const app=$('#app');
  if(!S.session){app.innerHTML=loginView();$('#loginBtn').onclick=login;$('#password').onkeydown=e=>{if(e.key==='Enter')login();};return;}
  if(S.screen==='leader')app.innerHTML=leaderView();
  else if(S.screen==='preview')app.innerHTML=previewView();
  else if(S.screen==='teacher')app.innerHTML=teacherView();
  else if(S.screen==='admin')app.innerHTML=adminView();
  else app.innerHTML=loginView();
  bindCommon();
  if(S.screen==='leader')bindLeader();
  if(S.screen==='preview')bindPreview();
  if(S.screen==='admin')bindAdmin();
}

render();
