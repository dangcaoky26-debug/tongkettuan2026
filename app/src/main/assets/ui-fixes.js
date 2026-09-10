// User-facing UI cleanup for Thi dua tuan 1.6.1
(function(){
  const friendlyErrors={
    LOGIN_FAILED:'Sai tài khoản hoặc mật khẩu',
    ACCOUNT_LOCKED:'Tài khoản đã bị khóa',
    ACCOUNT_DISABLED:'Tài khoản đã bị khóa',
    TIMEOUT:'Kết nối quá chậm. Vui lòng thử lại.',
    NETWORK_ERROR:'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.',
    HTML_RESPONSE:'Không thể kết nối. Vui lòng thử lại.',
    EMPTY_RESPONSE:'Không thể kết nối. Vui lòng thử lại.',
    BAD_JSON:'Không thể kết nối. Vui lòng thử lại.',
    WEEK_LOCKED:'Tuần báo cáo hiện đang khóa',
    WEEK_NOT_COUNTED:'Tuần này không tính thi đua',
    ROLE_NOT_ALLOWED:'Tài khoản không có quyền thực hiện thao tác này',
    AUTH_REQUIRED:'Vui lòng đăng nhập lại',
    AUTH_INVALID:'Vui lòng đăng nhập lại',
    TOKEN_EXPIRED:'Vui lòng đăng nhập lại',
    PASSWORD_FORMAT:'Mật khẩu phải từ 6 đến 20 ký tự',
    USERNAME_FORMAT:'Tên tài khoản không hợp lệ',
    USERNAME_EXISTS:'Tên tài khoản đã tồn tại',
    INVALID_CLASS:'Lớp không hợp lệ'
  };

  if(typeof err==='function'){
    err=function(r){
      const e=String(r&&r.error||'');
      return friendlyErrors[e] || (r&&r.message?String(r.message):'Có lỗi xảy ra. Vui lòng thử lại.');
    };
  }

  function normalizeLoginName(value){
    let s=String(value||'').trim().toUpperCase().replace(/\s+/g,'').replace(/-/g,'');
    if(/^((10[A-E])|(11[A-E])|(12[A-G]))$/.test(s)) s='LT'+s;
    if(/^GVCN((10[A-E])|(11[A-E])|(12[A-G]))$/.test(s)) s='GV'+s.slice(4);
    return s;
  }

  if(typeof login==='function'){
    login=async function(){
      const raw=($('#user')?.value||'').trim();
      const password=$('#password')?.value||'';
      if(!raw||!password)return toast('Nhập đầy đủ tài khoản và mật khẩu');
      const username=normalizeLoginName(raw);
      setBusy(true);
      const r=await api({action:'login',username,password,pin:password},65000);
      setBusy(false);
      if(!r.ok)return toast(err(r));
      S.session={token:r.token,username:r.username,role:r.role,className:r.className,displayName:r.displayName};
      S.home=r.home||null; S.weeks=r.weeks||[];
      S.week=S.home?.weekInfo?.week||S.home?.week?.week||S.home?.week||1;
      if(r.role==='LOP_TRUONG'){
        S.screen='leader';
        if(S.home) applyLeaderHome(S.home);
        else {
          const h=await safeApi({action:'leaderHome'},65000);
          if(!h||!h.ok){switchAccount();return toast(h?err(h):'Vui lòng đăng nhập lại');}
          applyLeaderHome(h.home);
        }
      }else if(r.role==='GVCN'){
        S.screen='teacher';
        if(S.home) S.cache.teacher[S.week]=S.home;
      }else if(r.role==='ADMIN'){
        S.screen='admin';
        if(S.home) S.cache.admin[S.week]=S.home;
      }else{
        switchAccount(); return toast('Tài khoản chưa được phân quyền');
      }
      render();
    };
  }

  if(typeof loginView==='function'){
    loginView=function(){
      return `<main class="shell login">
        <div class="loginMark">✓</div>
        <h1>Thi đua tuần</h1>
        <p class="muted">Đăng nhập để tiếp tục</p>
        <section class="card loginCard">
          <label>Tài khoản</label>
          <input id="user" class="input" placeholder="Nhập tài khoản" autocapitalize="characters" autocomplete="username">
          <label>Mật khẩu</label>
          <div class="passwordWrap">
            <input id="password" class="input passwordInput" type="password" maxlength="20" placeholder="Nhập mật khẩu" autocomplete="current-password">
            <button type="button" id="togglePassword" class="passwordToggle" aria-label="Hiện mật khẩu" aria-pressed="false">Hiện</button>
          </div>
          <button id="loginBtn" class="btn primary">Đăng nhập</button>
          <div class="helper cleanHelper">Sử dụng tài khoản đã được cấp.</div>
        </section>
      </main>`;
    };
  }

  function cleanTechnicalText(){
    const replacements=[
      ['Tuần đang điều khiển','Tuần báo cáo'],
      ['Điều khiển tập trung','Quản lý tuần'],
      ['Quản trị tức thời','Quản lý tài khoản'],
      ['Danh sách tài khoản chỉ tải khi cần để tăng tốc.','Danh sách tài khoản'],
      ['Chỉ tải khi cần để app mở nhanh hơn.','Chưa tải thống kê.'],
      ['Đổi tài khoản, mật khẩu hoặc khóa tài khoản sẽ thu hồi phiên đăng nhập cũ ngay lập tức.','Thay đổi có hiệu lực ngay sau khi lưu.'],
      ['Phiên đăng nhập đã bị thu hồi','Vui lòng đăng nhập lại'],
      ['Phiên đăng nhập đã hết hạn','Vui lòng đăng nhập lại']
    ];
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode())){
      let t=n.nodeValue||'';
      for(const [a,b] of replacements) if(t.includes(a)) t=t.split(a).join(b);
      if(/\b(API|Web App|token|server|máy chủ)\b/i.test(t)) t=t.replace(/\b(API|Web App|token|server|máy chủ)\b/gi,'hệ thống');
      n.nodeValue=t;
    }
  }

  document.addEventListener('click',function(e){
    const btn=e.target.closest&&e.target.closest('#togglePassword');
    if(!btn)return;
    const input=document.getElementById('password');
    if(!input)return;
    const show=input.type==='password';
    input.type=show?'text':'password';
    btn.textContent=show?'Ẩn':'Hiện';
    btn.setAttribute('aria-label',show?'Ẩn mật khẩu':'Hiện mật khẩu');
    btn.setAttribute('aria-pressed',show?'true':'false');
    input.focus();
  });

  if(typeof render==='function'){
    const originalRender=render;
    render=function(){originalRender();cleanTechnicalText();};
    render();
  }else cleanTechnicalText();
})();
