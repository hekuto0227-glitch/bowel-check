const APP_VERSION = "1.0.0";
const DATA_VERSION = 2;
const STORAGE_KEY = "bowelCheckData";
const TEST_KEY = "bowelCheckTestMode";

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0,10);
const uid = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const defaultData = () => ({
  dataVersion: DATA_VERSION,
  appVersion: APP_VERSION,
  testMode: false,
  users: [],
  bowelRecords: [],
  menstrualRecords: [],
  systemSettings: { warningDays: 3, alertDays: 4 }
});

let data = loadData();

function migrate(d){
  const base = defaultData();
  d = d && typeof d === "object" ? d : {};
  const out = {...base, ...d};
  out.users = Array.isArray(d.users) ? d.users : [];
  out.bowelRecords = Array.isArray(d.bowelRecords) ? d.bowelRecords : [];
  out.menstrualRecords = Array.isArray(d.menstrualRecords) ? d.menstrualRecords : [];
  out.systemSettings = {...base.systemSettings, ...(d.systemSettings || {})};
  out.dataVersion = DATA_VERSION;
  out.appVersion = APP_VERSION;
  out.users = out.users.map(u => ({
    id:u.id || uid("U"),
    name:u.name || "未設定",
    gender:u.gender || "unknown",
    menstrualManagement:!!u.menstrualManagement,
    laxative:{enabled:!!u.laxative?.enabled,name:u.laxative?.name||"",conditionDays:Number(u.laxative?.conditionDays)||0},
    enema:{enabled:!!u.enema?.enabled,name:u.enema?.name||"",conditionDays:Number(u.enema?.conditionDays)||0},
    active:u.active !== false
  }));
  return out;
}

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultData();
    return migrate(JSON.parse(raw));
  }catch(e){
    alert("保存データの読み込みに失敗しました。バックアップJSONから復元してください。");
    return defaultData();
  }
}

function save(){
  data = migrate(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
}

function downloadBlob(name, content, type){
  const blob = new Blob([content], {type});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function backup(){
  const payload = JSON.stringify({...data, exportedAt:new Date().toISOString()}, null, 2);
  downloadBlob(`bowel-check-backup-${today()}.json`, payload, "application/json");
}

function restoreFromFile(file){
  const r = new FileReader();
  r.onload = () => {
    try{
      const incoming = migrate(JSON.parse(r.result));
      if(!Array.isArray(incoming.users) || !Array.isArray(incoming.bowelRecords)) throw new Error();
      if(!confirm("バックアップデータで現在の保存データを置き換えます。続行しますか？")) return;
      data = incoming;
      save();
      alert("復元しました。");
    }catch(e){ alert("復元できるJSONではありません。"); }
  };
  r.readAsText(file);
}

function setTodayDefaults(){
  $("todayLabel").textContent = new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"});
  $("recordDate").value = today();
  $("menstrualDate").value = today();
  if(!$("historyStart").value) $("historyStart").value = new Date(Date.now()-14*86400000).toISOString().slice(0,10);
  if(!$("historyEnd").value) $("historyEnd").value = today();
}

function getUser(id){return data.users.find(u=>u.id===id)}
function activeUsers(){return data.users.filter(u=>u.active!==false)}
function recordsForUser(id){return data.bowelRecords.filter(r=>r.userId===id)}
function lastBowelDate(id, before=today()){
  const dates = recordsForUser(id).filter(r=>r.bowelConfirmed && r.date < before).map(r=>r.date).sort();
  return dates.length ? dates[dates.length-1] : null;
}
function daysSinceLast(id, onDate=today()){
  const rec = data.bowelRecords.find(r=>r.userId===id && r.date===onDate && r.bowelConfirmed);
  if(rec) return 0;
  const last = lastBowelDate(id,onDate);
  if(!last) return null;
  return Math.max(0, Math.floor((new Date(onDate)-new Date(last))/86400000));
}
function statusClass(days){
  if(days === null) return "";
  if(days >= Number(data.systemSettings.alertDays)) return "alert";
  if(days >= Number(data.systemSettings.warningDays)) return "warning";
  return "ok";
}
function menstrualActive(id,onDate=today()){
  const r = data.menstrualRecords.filter(x=>x.userId===id && x.date<=onDate).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  return r && r.status !== "end";
}

function fillUserSelects(){
  const selects = [$("recordUser"),$("menstrualUser"),$("historyUser")];
  selects.forEach(sel=>{
    const old=sel.value;
    sel.innerHTML = activeUsers().map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join("");
    if(old && activeUsers().some(u=>u.id===old)) sel.value=old;
  });
  if(!$("recordUser").value && activeUsers()[0]) $("recordUser").value=activeUsers()[0].id;
  if(!$("menstrualUser").value && activeUsers().find(u=>u.gender==="female")) $("menstrualUser").value=activeUsers().find(u=>u.gender==="female").id;
  if(!$("historyUser").value && activeUsers()[0]) $("historyUser").value=activeUsers()[0].id;
}

function renderDashboard(){
  const q=$("searchInput").value.trim().toLowerCase();
  const filter=$("statusFilter").value;
  const list=activeUsers().filter(u=>{
    if(q && !u.name.toLowerCase().includes(q)) return false;
    const d=daysSinceLast(u.id);
    if(filter==="warning" && !(d!==null && d>=data.systemSettings.warningDays)) return false;
    if(filter==="alert" && !(d!==null && d>=data.systemSettings.alertDays)) return false;
    if(filter==="female" && !u.menstrualManagement) return false;
    return true;
  });
  if(!list.length){$("dashboardCards").innerHTML='<div class="empty">利用者がいません。「利用者追加」から登録してください。</div>';return;}
  $("dashboardCards").innerHTML=list.map(u=>{
    const d=daysSinceLast(u.id), cls=statusClass(d);
    const todayRec=data.bowelRecords.find(r=>r.userId===u.id&&r.date===today());
    const menstrual=u.menstrualManagement && menstrualActive(u.id);
    const badges=[];
    if(u.laxative.enabled) badges.push(`<span class="badge">緩下剤：${esc(u.laxative.name||"設定あり")}</span>`);
    if(u.enema.enabled) badges.push(`<span class="badge">浣腸：${esc(u.enema.name||"設定あり")}</span>`);
    if(menstrual) badges.push('<span class="badge menstrual">月経</span>');
    if(d>=data.systemSettings.warningDays) badges.push(`<span class="badge ${d>=data.systemSettings.alertDays?"alert":"warn"}">${d>=data.systemSettings.alertDays?"⚠ ":""}${d}日目</span>`);
    return `<article class="card ${cls}">
      <h3>${esc(u.name)}</h3>
      <div class="metric">${todayRec?.bowelConfirmed ? "○ 排便あり" : "— 排便なし"}</div>
      <p>前回排便から：<strong>${d===null?"記録なし":d+"日目"}</strong></p>
      <div>${badges.join("")}</div>
      ${todayRec?.bowelConfirmed ? `<p class="hint">本日：${esc(todayRec.time||"時刻未入力")} ／ ${esc(todayRec.shape||"形状未入力")} ／ ブリストル${esc(todayRec.bristol||"-")}</p>`:""}
      <div class="button-row">
        <button class="primary" onclick="openRecord('${u.id}')">今日を入力</button>
        <button class="secondary" onclick="openHistory('${u.id}')">履歴</button>
      </div>
    </article>`;
  }).join("");
}

function openRecord(id){
  $("recordUser").value=id;
  $("recordDate").value=today();
  document.querySelector('[data-tab="record"]').click();
}
function openHistory(id){
  $("historyUser").value=id;
  document.querySelector('[data-tab="history"]').click();
  renderHistory();
}

function renderUserSettings(){
  $("userSettingsList").innerHTML=activeUsers().map(u=>`
    <div class="user-edit">
      <div><strong>${esc(u.name)}</strong><div class="hint">${u.gender==="female"?"女性":u.gender==="male"?"男性":"未設定"}</div></div>
      <div>${u.laxative.enabled?`緩下剤：${esc(u.laxative.name||"あり")}`:"緩下剤なし"}</div>
      <div>${u.enema.enabled?`浣腸：${esc(u.enema.name||"あり")}`:"浣腸なし"}</div>
      <div>${u.menstrualManagement?"月経管理あり":"月経管理なし"}</div>
      <div class="actions"><button class="secondary" onclick="editUser('${u.id}')">編集</button><button class="danger" onclick="deactivateUser('${u.id}')">非表示</button></div>
    </div>`).join("") || '<div class="empty">利用者がいません。</div>';
  $("warningDays").value=data.systemSettings.warningDays;
  $("alertDays").value=data.systemSettings.alertDays;
  $("storageStatus").textContent=`保存先：この端末のブラウザ／アプリ版 ${APP_VERSION}／データ版 ${DATA_VERSION}`;
}

function renderHistory(){
  const id=$("historyUser").value, start=$("historyStart").value, end=$("historyEnd").value;
  const users = $("historyScope").value==="all" ? activeUsers() : [getUser(id)].filter(Boolean);
  const rows=[];
  users.forEach(u=>{
    const dates=[];
    for(let d=new Date(start); d<=new Date(end); d.setDate(d.getDate()+1)){
      const ds=d.toISOString().slice(0,10);
      const r=data.bowelRecords.find(x=>x.userId===u.id&&x.date===ds);
      const days=daysSinceLast(u.id,ds);
      dates.push(`<tr><td>${esc(ds)}</td><td>${esc(u.name)}</td><td>${r?.bowelConfirmed?"○":"—"}</td><td>${r?.time||""}</td><td>${r?.amount||""}</td><td>${r?.shape||""}</td><td>${r?.bristol||""}</td><td>${days===null?"":days}</td><td>${r?.laxativeUsed?"○":""}</td><td>${r?.enemaUsed?"○":""}</td><td>${esc(r?.note||"")}</td></tr>`);
    }
    rows.push(...dates);
  });
  $("historyTableWrap").innerHTML=rows.length?`<table class="history-table"><thead><tr><th>日付</th><th>利用者</th><th>排便</th><th>時刻</th><th>量</th><th>形状</th><th>ブリストル</th><th>前回から</th><th>緩下剤</th><th>浣腸</th><th>その他・備考</th></tr></thead><tbody>${rows.join("")}</tbody></table>`:'<div class="empty">期間内のデータがありません。</div>';
}

function csvEscape(v){return `"${String(v??"").replace(/"/g,'""')}"`}
function exportCSV(){
  const id=$("historyUser").value, start=$("historyStart").value, end=$("historyEnd").value;
  const users=$("historyScope").value==="all"?activeUsers():[getUser(id)].filter(Boolean);
  const lines=[["日付","利用者名","排便確認","時刻","量","形状","ブリストル","前回排便からの日数","緩下剤使用","浣腸使用","その他・備考"].map(csvEscape).join(",")];
  users.forEach(u=>{
    for(let d=new Date(start); d<=new Date(end); d.setDate(d.getDate()+1)){
      const ds=d.toISOString().slice(0,10), r=data.bowelRecords.find(x=>x.userId===u.id&&x.date===ds), days=daysSinceLast(u.id,ds);
      lines.push([ds,u.name,r?.bowelConfirmed?"○":"",r?.time||"",r?.amount||"",r?.shape||"",r?.bristol||"",days??"",r?.laxativeUsed?"○":"",r?.enemaUsed?"○":"",r?.note||""].map(csvEscape).join(","));
    }
  });
  downloadBlob(`排便記録-${start}-${end}.csv`,"\uFEFF"+lines.join("\n"),"text/csv;charset=utf-8");
}

function makeExcelPrint(){
  const id=$("historyUser").value, start=$("historyStart").value, end=$("historyEnd").value, all=$("historyScope").value==="all";
  const users=all?activeUsers():[getUser(id)].filter(Boolean);
  const rows=[];
  users.forEach(u=>{
    for(let d=new Date(start);d<=new Date(end);d.setDate(d.getDate()+1)){
      const ds=d.toISOString().slice(0,10),r=data.bowelRecords.find(x=>x.userId===u.id&&x.date===ds),days=daysSinceLast(u.id,ds);
      rows.push(`<tr><td>${esc(ds)}</td><td>${esc(u.name)}</td><td>${r?.bowelConfirmed?"○":"—"}</td><td>${r?.time||""}</td><td>${r?.amount||""}</td><td>${r?.shape||""}</td><td>${r?.bristol||""}</td><td>${days??""}</td><td>${r?.laxativeUsed?"○":""}</td><td>${r?.enemaUsed?"○":""}</td><td>${esc(r?.note||"")}</td></tr>`);
    }
  });
  const size=all?"A3":"A4";
  const html=`<!doctype html><meta charset="utf-8"><title>排便記録</title><style>@page{size:${size} landscape;margin:10mm}body{font-family:Arial,"Yu Gothic",sans-serif}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #555;padding:4px}th{background:#eee} </style><h1>排便チェック記録（${start} ～ ${end}）</h1><table><thead><tr><th>日付</th><th>利用者</th><th>排便</th><th>時刻</th><th>量</th><th>形状</th><th>ブリストル</th><th>前回から</th><th>緩下剤</th><th>浣腸</th><th>その他・備考</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  downloadBlob(`排便記録-${size}-${start}-${end}.xls`,html,"application/vnd.ms-excel");
}

function openUserDialog(user){
  $("editUserId").value=user?.id||"";
  $("userDialogTitle").textContent=user?"利用者編集":"利用者追加";
  $("userName").value=user?.name||"";
  $("userGender").value=user?.gender||"unknown";
  $("menstrualManagement").checked=!!user?.menstrualManagement;
  $("userLaxativeName").value=user?.laxative?.name||"";
  $("userLaxativeDays").value=user?.laxative?.conditionDays||0;
  $("userEnemaName").value=user?.enema?.name||"";
  $("userEnemaDays").value=user?.enema?.conditionDays||0;
  $("userDialog").showModal();
}
function editUser(id){openUserDialog(getUser(id))}
function deactivateUser(id){
  if(!confirm("この利用者を一覧から非表示にします。過去データは削除されません。"))return;
  getUser(id).active=false;save();
}
function saveUser(e){
  e.preventDefault();
  const id=$("editUserId").value;
  const u={
    id:id||uid("U"),name:$("userName").value.trim(),gender:$("userGender").value,
    menstrualManagement:$("menstrualManagement").checked,
    laxative:{enabled:!!$("userLaxativeName").value.trim(),name:$("userLaxativeName").value.trim(),conditionDays:Number($("userLaxativeDays").value)||0},
    enema:{enabled:!!$("userEnemaName").value.trim(),name:$("userEnemaName").value.trim(),conditionDays:Number($("userEnemaDays").value)||0},
    active:true
  };
  if(!u.name){alert("利用者名を入力してください。");return}
  if(id){const i=data.users.findIndex(x=>x.id===id);data.users[i]=u}else data.users.push(u);
  $("userDialog").close();save();
}

function saveRecord(){
  const userId=$("recordUser").value,date=$("recordDate").value;
  if(!userId||!date){alert("利用者と日付を確認してください。");return}
  const rec={
    id:uid("R"),userId,date,bowelConfirmed:$("bowelConfirmed").value==="true",
    time:$("recordTime").value,amount:$("amount").value,bristol:$("bristol").value?Number($("bristol").value):null,
    shape:$("shape").value,laxativeUsed:$("laxativeUsed").checked,enemaUsed:$("enemaUsed").checked,note:$("note").value.trim()
  };
  const oldIndex=data.bowelRecords.findIndex(r=>r.userId===userId&&r.date===date);
  if(oldIndex>=0){rec.id=data.bowelRecords[oldIndex].id;data.bowelRecords[oldIndex]=rec}else data.bowelRecords.push(rec);
  save();alert("保存しました。");
}
function clearRecord(){
  $("bowelConfirmed").value="false";$("recordTime").value="";$("amount").value="";$("bristol").value="";$("shape").value="";$("laxativeUsed").checked=false;$("enemaUsed").checked=false;$("note").value="";
}

function saveMenstrual(){
  const user=getUser($("menstrualUser").value);
  if(!user||user.gender!=="female"){alert("女性の利用者を選択してください。");return}
  data.menstrualRecords.push({id:uid("M"),userId:user.id,date:$("menstrualDate").value,status:$("menstrualStatus").value,note:$("menstrualNote").value.trim()});
  save();alert("月経情報を保存しました。");
}

function saveSettings(){
  data.systemSettings.warningDays=Number($("warningDays").value)||3;
  data.systemSettings.alertDays=Number($("alertDays").value)||4;
  save();alert("設定を保存しました。");
}

function loadTest(file){
  const r=new FileReader();r.onload=()=>{
    try{
      const incoming=migrate(JSON.parse(r.result));
      incoming.testMode=true;
      data=incoming;localStorage.setItem(TEST_KEY,"1");save();
      alert("テストデータを読み込みました。実データを使う前にテストモードを終了してください。");
    }catch(e){alert("テストデータの形式が正しくありません。")}
  };r.readAsText(file);
}
function exitTest(){
  if(!data.testMode){alert("現在テストモードではありません。");return}
  if(!confirm("現在のテストデータを終了し、空の実データ領域へ切り替えます。テストデータはこの端末の保存領域から削除されます。よろしいですか？"))return;
  data=defaultData();data.testMode=false;localStorage.removeItem(TEST_KEY);save();
  alert("テストモードを終了しました。");
}

function renderAll(){
  fillUserSelects();renderDashboard();renderUserSettings();renderHistory();
  const test=data.testMode;
  $("testModeBtn").textContent=test?"テストモード中":"テストデータ";
  $("alertArea").innerHTML=test?'<div class="test-banner">🧪 テストモード中：現在のデータはテスト用です。本番利用者データとは分けて確認してください。</div>':"";
}

document.addEventListener("DOMContentLoaded",()=>{
  setTodayDefaults();
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");$(b.dataset.tab).classList.add("active");
    if(b.dataset.tab==="history")renderHistory();
  }));
  $("searchInput").addEventListener("input",renderDashboard);
  $("statusFilter").addEventListener("change",renderDashboard);
  $("addUserBtn").onclick=()=>openUserDialog();
  $("addUserBtn2").onclick=()=>openUserDialog();
  $("userForm").addEventListener("submit",saveUser);
  $("saveRecordBtn").onclick=saveRecord;
  $("clearRecordBtn").onclick=clearRecord;
  $("saveMenstrualBtn").onclick=saveMenstrual;
  $("saveSettingsBtn").onclick=saveSettings;
  $("backupBtn").onclick=backup;
  $("exportDataBtn").onclick=backup;
  $("restoreBtn").onclick=()=>$("restoreInput").click();
  $("restoreInput").onchange=e=>e.target.files[0]&&restoreFromFile(e.target.files[0]);
  $("csvBtn").onclick=exportCSV;
  $("printBtn").onclick=makeExcelPrint;
  $("historyScope").onchange=renderHistory;
  $("historyStart").onchange=renderHistory;
  $("historyEnd").onchange=renderHistory;
  $("historyUser").onchange=renderHistory;
  $("testModeBtn").onclick=()=>$("testInput").click();
  $("testInput").onchange=e=>e.target.files[0]&&loadTest(e.target.files[0]);
  $("importTestBtn").onclick=()=>$("testInput").click();
  $("clearTestBtn").onclick=exitTest;
  setInterval(()=>{if($("recordDate").value===today())setTodayDefaults()},60000);
  renderAll();
});
