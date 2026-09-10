// Tối ưu cảm nhận tốc độ - v1.6.3
(function(){
  const FAST_KEY='thiDuaFastStateV1';
  const FAST_TTL=7*24*60*60*1000;
  const AUTO_REFRESH_GAP=90*1000;
  let lastSyncAt=0;

  function saveFastState(){
    try{
      if(!S.session||!S.home)return;
      localStorage.setItem(FAST_KEY,JSON.stringify({
        savedAt:Date.now(),
        session:S.session,
        screen:S.session.role==='LOP_TRUONG'?'leader':(S.session.role==='GVCN'?'teacher':'admin'),
        week:S.week,
        weeks:S.weeks||[],
        home:S.home,
        adminTab:S.adminTab||'overview'
      }));
    }catch(e){}
  }

  function removeFastState(){
    try{localStorage.removeItem(FAST_KEY)}catch(e){}
  }

  function restoreFastState(){
    try{
      const x=JSON.parse(localStorage.getItem(FAST_KEY)||'null');
      if(!x||!x.savedAt||Date.now()-Number(x.savedAt)>FAST_TTL||!x.session?.token||!x.home){
        removeFastState();
        return false;
      }
      S.session=x.session;
      S.weeks=Array.isArray(x.weeks)?x.weeks:[];
      S.week=Number(x.week||1);
      S.adminTab=x.adminTab||'overview';
      S.accounts=null;
      S.analytics=null;
      S.cache={admin:{},teacher:{}};
      const cc=cachedCriteria();
      if(cc?.data)S.criteria=cc.data;
      if(S.session.role==='LOP_TRUONG'){
        S.screen='leader';
        applyLeaderHome(x.home,false);
      }else if(S.session.role==='GVCN'){
        S.screen='teacher';
        S.home=x.home;
        S.cache.teacher[S.week]=x.home;
      }else if(S.session.role==='ADMIN'){
        S.screen='admin';
        S.home=x.home;
        S.cache.admin[S.week]=x.home;
      }else{
        removeFastState();
        return false;
      }
      lastSyncAt=Number(x.savedAt)||0;
      render();
      return true;
    }catch(e){
      removeFastState();
      return false;
    }
  }

  const originalSwitchAccount=switchAccount;
  switchAccount=function(){
    removeFastState();
    originalSwitchAccount();
  };

  const originalLogin=login;
  login=async function(){
    await originalLogin();
    if(S.session){lastSyncAt=Date.now();saveFastState();}
  };

  refreshLeader=async function(force=true){
    if(hasDraft()&&force&&!confirm('Làm mới sẽ bỏ các thay đổi chưa gửi. Tiếp tục?'))return;
    if(!force&&Date.now()-lastSyncAt<AUTO_REFRESH_GAP)return;
    if(force)setBusy(true);
    const r=await safeApi({action:'leaderHome',includeCriteria:S.criteria.length===0},65000);
    if(force)setBusy(false);
    if(!r)return;
    if(!r.ok){if(force)toast(err(r));return;}
    if(Array.isArray(r.home?.criteria)&&r.home.criteria.length){
      S.criteria=r.home.criteria;
      saveCriteria(r.criteriaVersion,S.criteria);
    }
    applyLeaderHome(r.home,false);
    lastSyncAt=Date.now();
    saveFastState();
    render();
  };

  const originalChangeWeek=changeWeek;
  changeWeek=async function(week){
    await originalChangeWeek(week);
    if(S.session&&S.home){lastSyncAt=Date.now();saveFastState();}
  };

  if(typeof submitReport==='function'){
    const originalSubmitReport=submitReport;
    submitReport=async function(){
      await originalSubmitReport();
      if(S.session&&S.screen==='leader'&&S.home){lastSyncAt=Date.now();saveFastState();}
    };
  }

  if(typeof decision==='function'){
    const originalDecision=decision;
    decision=async function(className,value){
      await originalDecision(className,value);
      if(S.session&&S.home){lastSyncAt=Date.now();saveFastState();}
    };
  }

  if(typeof saveWeek==='function'){
    const originalSaveWeek=saveWeek;
    saveWeek=async function(week){
      await originalSaveWeek(week);
      if(S.session&&S.home){lastSyncAt=Date.now();saveFastState();}
    };
  }

  function updateLeaderEditorFast(){
    const list=$('#criteriaList');
    if(list){
      list.innerHTML=criteriaHtml(S.query);
      bindCriteriaOnly();
    }
    const t=calc();
    const stats=$$('.stats4 > div > b');
    if(stats.length>=4){
      stats[0].textContent=t.selected;
      stats[1].textContent=t.violations;
      stats[2].textContent=t.rewards;
      stats[3].textContent=t.score;
    }
    const hero=$('.heroCard strong');
    if(hero)hero.textContent=t.score;
    const meta=$$('.heroMeta b');
    if(meta.length>=2){meta[0].textContent=t.minus;meta[1].textContent='+'+t.plus;}
    const sticky=$('.stickyBar b');
    if(sticky)sticky.textContent=t.score;
  }

  bindCriteriaOnly=function(){
    $$('[data-step]').forEach(b=>b.onclick=()=>{
      const e=entry(b.dataset.step);
      e.qty=Math.max(0,e.qty+Number(b.dataset.delta));
      updateLeaderEditorFast();
    });
    $$('[data-field]').forEach(el=>el.oninput=()=>{
      entry(el.dataset.field)[el.dataset.key]=el.value;
    });
  };

  function refreshVisibleData(){
    if(!S.session||hasDraft())return;
    if(S.session.role==='LOP_TRUONG')refreshLeader(false);
    else if(S.session.role==='GVCN'||S.session.role==='ADMIN')changeWeek(S.week);
  }

  const restored=restoreFastState();
  if(restored)setTimeout(refreshVisibleData,250);
})();
