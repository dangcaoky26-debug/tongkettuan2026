// Submit flow reliability patch - v1.6.2
(function(){
  function showSubmitState(text, disabled){
    const btn=document.getElementById('submitBtn');
    if(!btn)return;
    btn.textContent=text;
    btn.disabled=!!disabled;
  }

  // Preview screen is already the confirmation step, so do not rely on
  // JavaScript confirm() before sending. This avoids Android WebView dialog issues.
  submitReport = async function(){
    if(S.busy)return;
    const week=Number(S.week||0);
    const entries=S.criteria
      .filter(c=>entry(c.code).qty>0)
      .map(c=>({code:c.code,...entry(c.code)}));

    if(!week){
      toast('Không xác định được tuần báo cáo. Vui lòng quay lại và thử lại.');
      return;
    }

    showSubmitState('Đang gửi báo cáo…',true);
    setBusy(true);
    const r=await safeApi({action:'submit',week,entries},65000);
    setBusy(false);

    if(!r){
      showSubmitState('Gửi lại',false);
      return;
    }
    if(!r.ok){
      showSubmitState('Gửi lại',false);
      toast(err(r));
      return;
    }

    applyLeaderHome(r.home,false);
    S.screen='leader';
    render();
    toast(r.overwritten?'Đã cập nhật lại báo cáo tuần '+week:'Đã gửi báo cáo tuần '+week+' thành công');
  };

  // Rebind in case this patch loads while preview is already visible.
  const oldBindPreview=bindPreview;
  bindPreview=function(){
    oldBindPreview();
    const btn=document.getElementById('submitBtn');
    if(btn)btn.onclick=submitReport;
  };
})();
