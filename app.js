const SUPABASE_URL='https://tpxlduvtocvasxqpmqom.supabase.co',SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRweGxkdXZ0b2N2YXN4cXBtcW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTE5OTAsImV4cCI6MjA4OTI4Nzk5MH0.bKtk8DiPI5RVX-DYirjSkicjzELiryHsp9v6Hyi17KM';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_ANON);

let currentUser=null,currentBets=[],activeBetData={},activeResultFixture=null;
let registeredPlayers=[],ctSelectedPlayers=[];
let tournament=null;
let pollInterval=null;

const ALL_SECTIONS=['home','bets','leaderboard','league'];

window.addEventListener('DOMContentLoaded',async()=>{
  // Load tournament FIRST so it's ready before showDashboard renders the arena
  await loadTournamentFromSupabase();
  const{data:{session}}=await db.auth.getSession();
  if(session) await loadUserProfile(session.user.id);
  startPolling();
});

// ── AUTH ──
async function signUp(){
  const username=document.getElementById('signup-username').value.trim().toLowerCase();
  const password=document.getElementById('signup-password').value;
  const confirm=document.getElementById('signup-confirm').value;
  clearMessages('signup');
  if(!username||!password){showError('signup','Please fill in all fields.');return;}
  if(!/^[a-z0-9_]{3,20}$/.test(username)){showError('signup','Username must be 3–20 characters (letters, numbers, underscores only).');return;}
  if(password.length<6){showError('signup','Password must be at least 6 characters.');return;}
  if(password!==confirm){showError('signup','Passwords do not match.');return;}
  const btn=document.getElementById('signup-btn');
  btn.disabled=true;btn.querySelector('span').textContent='Creating account…';
  const{data:existing}=await db.from('players').select('id').eq('username',username).single();
  if(existing){showError('signup','That username is already taken.');btn.disabled=false;btn.querySelector('span').textContent='Join the Arena';return;}
  const{data:authData,error:authError}=await db.auth.signUp({email:`${username}@royalbet.gg`,password});
  if(authError){showError('signup',authError.message);btn.disabled=false;btn.querySelector('span').textContent='Join the Arena';return;}
  const{error:profileError}=await db.from('players').insert({id:authData.user.id,username,balance:1000,wins:0});
  btn.disabled=false;btn.querySelector('span').textContent='Join the Arena';
  if(profileError) showError('signup','Account created but profile setup failed. Please sign in.');
  else{showSuccess('signup','🎉 Account created! Welcome to the Arena.');setTimeout(()=>switchTab('signin'),1500);}
}

async function signIn(){
  const username=document.getElementById('signin-username').value.trim().toLowerCase();
  const password=document.getElementById('signin-password').value;
  clearMessages('signin');
  if(!username||!password){showError('signin','Please enter your username and password.');return;}
  const btn=document.getElementById('signin-btn');
  btn.disabled=true;btn.querySelector('span').textContent='Entering Arena…';
  const{data,error}=await db.auth.signInWithPassword({email:`${username}@royalbet.gg`,password});
  btn.disabled=false;btn.querySelector('span').textContent='Enter the Arena';
  if(error){showError('signin','Incorrect username or password.');return;}
  await loadUserProfile(data.user.id);
}

async function loadUserProfile(userId){
  const{data:profile}=await db.from('players').select('*').eq('id',userId).single();
  if(!profile){await db.auth.signOut();return;}
  currentUser=profile;showDashboard();
}

async function signOut(){
  clearInterval(pollInterval);
  await db.auth.signOut();
  currentUser=null;currentBets=[];
  document.getElementById('auth-page').style.display='flex';
  document.getElementById('dashboard-page').style.display='none';
}

function showDashboard(){
  document.getElementById('nav-username').textContent=currentUser.username;
  document.getElementById('nav-avatar').textContent=currentUser.username.slice(0,2).toUpperCase();
  updateBalance();
  document.getElementById('auth-page').style.display='none';
  document.getElementById('dashboard-page').style.display='block';
  updateNavForUser();
  showSection('home');
  loadMyBets();
  renderArena();
}

function updateBalance(){document.getElementById('nav-balance').textContent=currentUser.balance.toLocaleString();}
function isCreator(){return tournament&&currentUser&&tournament.creatorId===currentUser.id;}

function updateNavForUser(){
  const leagueLink=document.getElementById('nav-league-link');
  if(leagueLink) leagueLink.style.display=isCreator()?'block':'none';
}

function showSection(name){
  ALL_SECTIONS.forEach(s=>{
    const el=document.getElementById(`section-${s}`);
    if(el) el.style.display=s===name?'block':'none';
  });
  document.querySelectorAll('.nav-link').forEach(el=>{
    el.classList.toggle('active',el.dataset.section===name);
  });
  if(name==='league') renderLeague();
  if(name==='leaderboard') renderLeaderboard();
}

// ── SUPABASE TOURNAMENT SYNC ──
async function saveTournamentToSupabase(){
  if(!tournament) return;
  localStorage.setItem('royalbet_tournament',JSON.stringify(tournament));
  try{await db.from('tournaments').upsert({id:'active',data:tournament,updated_at:new Date().toISOString()});}catch(e){}
}

async function loadTournamentFromSupabase(){
  try{
    const{data}=await db.from('tournaments').select('data').eq('id','active').single();
    if(data?.data){tournament=data.data;localStorage.setItem('royalbet_tournament',JSON.stringify(tournament));return;}
  }catch(e){}
  const raw=localStorage.getItem('royalbet_tournament');
  if(raw){try{tournament=JSON.parse(raw);}catch(e){tournament=null;}}
}

async function deleteTournamentFromSupabase(){
  localStorage.removeItem('royalbet_tournament');
  try{await db.from('tournaments').delete().eq('id','active');}catch(e){}
}

function startPolling(){
  pollInterval=setInterval(async()=>{
    if(!currentUser) return;
    const prevStates=tournament?JSON.stringify(tournament.roundStates)+tournament.currentRound:'null';
    await loadTournamentFromSupabase();
    const nextStates=tournament?JSON.stringify(tournament.roundStates)+tournament.currentRound:'null';
    if(prevStates!==nextStates){
      renderArena();
      refreshActiveArenaTab();
      updateNavForUser();
    }
  },5000);
}

// ── ARENA (home section) ──
function renderArena(){
  updateNavForUser();
  const empty=document.getElementById('arena-empty');
  const active=document.getElementById('arena-tournament');
  if(!tournament){empty.style.display='flex';active.style.display='none';return;}
  empty.style.display='none';active.style.display='block';
  const endBtn=document.getElementById('arena-end-btn');
  if(endBtn) endBtn.style.display=isCreator()?'inline-flex':'none';
  document.getElementById('tournament-name-display').textContent=tournament.name;
  const ri=tournament.currentRound??0;
  const totalRounds=tournament.fixtures.length;
  const state=tournament.roundStates?.[ri]||'open';
  const stateLabel={open:'No Round Active',displayed:'Betting Open',locked:'Bets Locked',ended:'Round Complete'}[state]||state;
  document.getElementById('tournament-round-display').textContent=`Round ${ri+1} of ${totalRounds} · ${stateLabel}`;
  renderArenaFixtures();
}

function refreshActiveArenaTab(){
  renderArenaFixtures();
}

function renderLeagueTable(){
  const tbody=document.getElementById('league-table-body');
  if(!tournament||!tbody) return;
  const sorted=[...tournament.table].sort((a,b)=>b.pts-a.pts||b.w-a.w||(b.w-b.l)-(a.w-a.l));
  tbody.innerHTML=sorted.map((p,i)=>`
    <tr class="rank-${i+1}">
      <td><span class="rank-num">${i+1}</span></td>
      <td><div class="player-name-cell">${p.name}</div>${p.crTag?`<div class="player-cr-tag">${p.crTag}</div>`:''}</td>
      <td>${p.p}</td><td>${p.w}</td><td>${p.d}</td><td>${p.l}</td>
      <td><span class="pts-cell">${p.pts}</span></td>
    </tr>`).join('');
}

function renderArenaFixtures(){
  const container=document.getElementById('fixtures-container');
  if(!container) return;
  if(!tournament){container.innerHTML='';return;}
  const ri=tournament.currentRound??0;
  const state=tournament.roundStates?.[ri]||'open';
  const round=tournament.fixtures[ri];
  if(!round){container.innerHTML='<div class="empty-state">No round is currently displayed.</div>';return;}
  if(state==='open'){container.innerHTML='<div class="empty-state">⏳ The tournament creator hasn\'t displayed a round yet.</div>';return;}
  const locked=state==='locked'||state==='ended';
  container.innerHTML=`
    <div class="round-block">
      <div class="round-title" style="display:flex;align-items:center;gap:.75rem">
        Round ${ri+1}
        <span class="round-state-badge state-${state}">${{displayed:'🟢 Betting Open',locked:'🔒 Bets Locked',ended:'✅ Complete'}[state]||state}</span>
      </div>
      <div class="fixtures-grid">${round.map((fix,fi)=>renderArenaFixtureCard(fix,ri,fi,locked)).join('')}</div>
    </div>`;
}

function renderArenaFixtureCard(fix,ri,fi,locked){
  if(fix.result){
    const label=fix.result==='draw'?'<span class="badge-draw">🤝 Draw</span>':`<span class="badge-won">🏆 ${fix.result} wins</span>`;
    return `<div class="fixture-card played"><div class="fixture-matchup"><span class="fixture-player">${fix.p1}</span><span class="fixture-vs">VS</span><span class="fixture-player">${fix.p2}</span></div><div class="fixture-result-label">${label}</div></div>`;
  }
  const betBtn=locked
    ?`<button class="btn-fixture-bet" disabled style="opacity:.4;cursor:not-allowed">🔒 Locked</button>`
    :`<button class="btn-fixture-bet" onclick="openBetModal(${ri},${fi})">🪙 Place Bet</button>`;
  return `<div class="fixture-card"><div class="fixture-matchup"><span class="fixture-player">${fix.p1}</span><span class="fixture-vs">VS</span><span class="fixture-player">${fix.p2}</span></div><div class="fixture-actions">${betBtn}</div></div>`;
}

// ── LEAGUE SECTION (creator only) ──
function renderLeague(){
  const container=document.getElementById('league-rounds-container');
  if(!container||!tournament) return;
  container.innerHTML=tournament.fixtures.map((round,ri)=>{
    const state=tournament.roundStates?.[ri]||'open';
    const isCurrent=ri===tournament.currentRound;
    return `
      <div class="league-round-block${isCurrent?' league-round-current':''}">
        <div class="league-round-header">
          <div class="league-round-title-row">
            <span class="league-round-num">Round ${ri+1}</span>
            <span class="round-state-badge state-${state}">${{open:'Not Displayed',displayed:'🟢 Betting Open',locked:'🔒 Locked',ended:'✅ Ended'}[state]}</span>
          </div>
          <div class="league-round-controls">${renderRoundControls(ri,state)}</div>
        </div>
        <div class="league-fixtures-list">${round.map((fix,fi)=>renderLeagueFixtureRow(fix,ri,fi,state)).join('')}</div>
      </div>`;
  }).join('');
}

function renderRoundControls(ri,state){
  if(state==='open') return `<button class="btn-round-action btn-display" onclick="roundDisplay(${ri})">📺 Display</button>`;
  if(state==='displayed') return `<button class="btn-round-action btn-lock" onclick="roundLock(${ri})">🔒 Lock</button>`;
  if(state==='locked') return `<button class="btn-round-action btn-end-round" onclick="roundEnd(${ri})">✅ End Round</button>`;
  if(state==='ended'){
    const allDone=tournament.fixtures[ri].every(f=>f.result);
    return allDone?`<span class="round-done-label">All results in</span>`:`<span class="round-done-label">Enter results below</span>`;
  }
  return '';
}

function renderLeagueFixtureRow(fix,ri,fi,state){
  if(fix.result){
    const label=fix.result==='draw'?'🤝 Draw':`🏆 ${fix.result}`;
    return `<div class="league-fixture-row played"><span class="lf-player">${fix.p1}</span><span class="lf-vs">vs</span><span class="lf-player">${fix.p2}</span><span class="lf-result">${label}</span></div>`;
  }
  const canResult=state==='ended';
  return `
    <div class="league-fixture-row${canResult?'':' lf-pending'}">
      <span class="lf-player">${fix.p1}</span>
      <span class="lf-vs">vs</span>
      <span class="lf-player">${fix.p2}</span>
      ${canResult
        ?`<button class="btn-fixture-result" onclick="openResultModal(${ri},${fi})">📋 Submit Result</button>`
        :`<span class="lf-awaiting">${state==='open'?'Not displayed':state==='displayed'?'Betting open':state==='locked'?'Locked':'—'}</span>`}
    </div>`;
}

// ── ROUND STATE MACHINE ──
async function roundDisplay(ri){
  if(!isCreator()) return;
  tournament.roundStates[ri]='displayed';
  tournament.currentRound=ri;
  await saveTournamentToSupabase();
  renderLeague();renderArena();refreshActiveArenaTab();
}

async function roundLock(ri){
  if(!isCreator()) return;
  tournament.roundStates[ri]='locked';
  await saveTournamentToSupabase();
  renderLeague();renderArena();refreshActiveArenaTab();
}

async function roundEnd(ri){
  if(!isCreator()) return;
  tournament.roundStates[ri]='ended';
  await saveTournamentToSupabase();
  renderLeague();renderArena();refreshActiveArenaTab();
}

// ── CREATE TOURNAMENT MODAL ──
async function openCreateTournament(){
  if(!currentUser){showError('signin','Please sign in to create a tournament.');return;}
  ctSelectedPlayers=[];
  document.getElementById('ct-name').value='';
  document.getElementById('ct-new-name').value='';
  document.getElementById('ct-new-cr-id').value='';
  const errEl=document.getElementById('ct-error');
  if(errEl) errEl.style.display='none';
  // Fetch ALL players with no row limit — Supabase default page size is 1000
  const{data,error}=await db.from('players').select('id,username').order('username').limit(1000);
  if(error) console.warn('Could not fetch players:', error.message);
  registeredPlayers=data||[];
  renderCTRegistered();renderCTSelected();
  ctNextStep(1);
  document.getElementById('create-tournament-modal').style.display='flex';
}

function closeCreateModal(event){
  if(event&&event.target!==document.getElementById('create-tournament-modal')) return;
  document.getElementById('create-tournament-modal').style.display='none';
}

function ctNextStep(step){
  document.getElementById('ct-step-1').style.display=step===1?'block':'none';
  document.getElementById('ct-step-2').style.display=step===2?'block':'none';
  if(step===2) renderCTRegistered();
}

function renderCTRegistered(){
  const list=document.getElementById('ct-registered-list');
  if(!list) return;
  if(!registeredPlayers.length){list.innerHTML='<div style="color:var(--text-dim);font-size:.85rem">No registered players found</div>';return;}
  list.innerHTML=registeredPlayers.map(p=>{
    const already=ctSelectedPlayers.find(s=>s.id===p.id);
    return `<div class="ct-registered-item${already?' disabled':''}" onclick="${already?'':'ctAddRegistered(\''+p.id+'\',\''+p.username+'\')'}">
      <span class="ct-registered-name">${p.username}</span><span class="plus">${already?'✓':'+'}</span>
    </div>`;
  }).join('');
}

function ctAddRegistered(id,username){
  if(ctSelectedPlayers.find(p=>p.id===id)) return;
  ctSelectedPlayers.push({id,name:username,isGuest:false});
  renderCTRegistered();renderCTSelected();
}

function ctAddNewPlayer(){
  const name=document.getElementById('ct-new-name').value.trim();
  const crTag=document.getElementById('ct-new-cr-id').value.trim();
  if(!name){alert('Please enter a player name.');return;}
  if(ctSelectedPlayers.find(p=>p.name.toLowerCase()===name.toLowerCase())){alert('Player already added.');return;}
  ctSelectedPlayers.push({id:`guest_${Date.now()}`,name,crTag,isGuest:true});
  document.getElementById('ct-new-name').value='';
  document.getElementById('ct-new-cr-id').value='';
  renderCTRegistered();renderCTSelected();
}

function ctRemovePlayer(id){
  ctSelectedPlayers=ctSelectedPlayers.filter(p=>p.id!==id);
  renderCTRegistered();renderCTSelected();
}

function renderCTSelected(){
  const list=document.getElementById('ct-selected-list');
  const count=document.getElementById('ct-selected-count');
  count.textContent=ctSelectedPlayers.length;
  if(!ctSelectedPlayers.length){list.innerHTML='<div class="ct-empty-selected">No players added yet</div>';return;}
  list.innerHTML=ctSelectedPlayers.map(p=>`<span class="ct-selected-chip">${p.name}<button class="ct-chip-remove" onclick="ctRemovePlayer('${p.id}')">×</button></span>`).join('');
}

async function ctGenerateTournament(){
  const name=document.getElementById('ct-name').value.trim();
  const errEl=document.getElementById('ct-error');
  if(!name){errEl.textContent='Please enter a tournament name.';errEl.style.display='block';ctNextStep(1);return;}
  if(ctSelectedPlayers.length<2){errEl.textContent='Add at least 2 players.';errEl.style.display='block';return;}
  errEl.style.display='none';
  const players=[...ctSelectedPlayers];
  const fixtures=generateRoundRobin(players);
  const roundStates=fixtures.map(()=>'open');
  const table=players.map(p=>({id:p.id,name:p.name,crTag:p.crTag||'',p:0,w:0,d:0,l:0,pts:0}));
  tournament={name,creatorId:currentUser.id,players,fixtures,table,roundStates,currentRound:0};
  await saveTournamentToSupabase();
  document.getElementById('create-tournament-modal').style.display='none';
  updateNavForUser();
  renderArena();
}

function generateRoundRobin(players){
  const list=[...players];
  if(list.length%2!==0) list.push({id:'bye',name:'BYE'});
  const rounds=list.length-1,half=list.length/2;
  const fixtures=[],rotation=[...list];
  for(let r=0;r<rounds;r++){
    const round=[];
    for(let i=0;i<half;i++){
      const p1=rotation[i],p2=rotation[rotation.length-1-i];
      if(p1.id!=='bye'&&p2.id!=='bye') round.push({p1:p1.name,p2:p2.name,p1id:p1.id,p2id:p2.id,result:null});
    }
    fixtures.push(round);
    rotation.splice(1,0,rotation.pop());
  }
  return fixtures;
}

async function endTournament(){
  if(!confirm('End this tournament? All data will be cleared.')) return;
  await deleteTournamentFromSupabase();
  tournament=null;
  updateNavForUser();
  showSection('home');
  renderArena();
}

// ── RESULT MODAL ──
function openResultModal(ri,fi){
  const fix=tournament.fixtures[ri][fi];
  activeResultFixture={ri,fi,fix};
  document.getElementById('result-match-info').textContent=`${fix.p1} vs ${fix.p2}`;
  document.getElementById('result-options').innerHTML=`
    <button class="result-btn win" onclick="recordResult('${fix.p1}')">🏆 ${fix.p1} Wins</button>
    <button class="result-btn win" onclick="recordResult('${fix.p2}')">🏆 ${fix.p2} Wins</button>
    <button class="result-btn draw" onclick="recordResult('draw')">🤝 Draw</button>`;
  document.getElementById('result-modal').style.display='flex';
}

function closeResultModal(event){
  if(event&&event.target!==document.getElementById('result-modal')) return;
  document.getElementById('result-modal').style.display='none';
}

async function recordResult(winner){
  const{ri,fi,fix}=activeResultFixture;
  tournament.fixtures[ri][fi].result=winner;
  const upd=(name,w,d,l)=>{const row=tournament.table.find(p=>p.name===name);if(!row)return;row.p++;row.w+=w;row.d+=d;row.l+=l;row.pts+=w?3:d?1:0;};
  if(winner==='draw'){upd(fix.p1,0,1,0);upd(fix.p2,0,1,0);}
  else{upd(winner,1,0,0);upd(winner===fix.p1?fix.p2:fix.p1,0,0,1);}
  await saveTournamentToSupabase();
  await settleBetsForFixture(ri,fi,winner);
  document.getElementById('result-modal').style.display='none';
  renderLeague();renderArena();refreshActiveArenaTab();
}

// ── BET MODAL ──
function openBetModal(ri,fi){
  if(!currentUser){showError('signin','Please sign in to place bets.');return;}
  const state=tournament.roundStates?.[ri]||'open';
  if(state==='locked'||state==='ended'){alert('Bets are locked for this round.');return;}
  const fix=tournament.fixtures[ri][fi];
  activeBetData={ri,fi,fix,picked:null};
  document.getElementById('modal-match-info').textContent=`${fix.p1} vs ${fix.p2}`;
  document.getElementById('modal-sides').innerHTML=`
    <button class="side-btn" onclick="selectFixtureSide('${fix.p1}')">⚔ ${fix.p1}</button>
    <button class="side-btn" onclick="selectFixtureSide('${fix.p2}')">⚔ ${fix.p2}</button>
    <button class="side-btn" onclick="selectFixtureSide('draw')">🤝 Draw</button>`;
  document.getElementById('bet-balance-hint').textContent=`Your balance: 🪙 ${currentUser.balance.toLocaleString()}`;
  document.getElementById('bet-amount').value='';
  document.getElementById('bet-modal').style.display='flex';
}

function selectFixtureSide(pick){
  activeBetData.picked=pick;
  document.querySelectorAll('.side-btn').forEach(btn=>btn.classList.toggle('selected',btn.textContent.includes(pick)));
}

function closeBetModal(event){
  if(event&&event.target!==document.getElementById('bet-modal')) return;
  document.getElementById('bet-modal').style.display='none';
}

async function confirmBet(){
  const amount=parseInt(document.getElementById('bet-amount').value);
  if(!amount||amount<10){alert('Minimum bet is 🪙 10 gold.');return;}
  if(amount>currentUser.balance){alert('Not enough gold!');return;}
  if(!activeBetData.picked){alert('Please select a side to bet on.');return;}
  await loadTournamentFromSupabase();
  const state=tournament.roundStates?.[activeBetData.ri]||'open';
  if(state==='locked'||state==='ended'){alert('Bets are now locked!');document.getElementById('bet-modal').style.display='none';renderArena();return;}
  const btn=document.getElementById('confirm-bet-btn');
  btn.disabled=true;btn.textContent='Placing…';
  currentUser.balance-=amount;
  await db.from('players').update({balance:currentUser.balance}).eq('id',currentUser.id);
  updateBalance();
  const fix=activeBetData.fix;
  const odds=activeBetData.picked==='draw'?3.0:2.0;
  const bet={player_id:currentUser.id,match_id:`t_${activeBetData.ri}_${activeBetData.fi}`,match_name:`${fix.p1} vs ${fix.p2}`,picked:activeBetData.picked,odds,amount,potential_win:Math.round(amount*odds),status:'pending',round_index:activeBetData.ri,fixture_index:activeBetData.fi};
  await db.from('bets').insert(bet);
  currentBets.unshift(bet);renderMyBets();
  btn.disabled=false;btn.textContent='Confirm Bet';
  document.getElementById('bet-modal').style.display='none';
}

async function settleBetsForFixture(ri,fi,winner){
  const matchId=`t_${ri}_${fi}`;
  const{data:pendingBets}=await db.from('bets').select('*').eq('match_id',matchId).eq('status','pending');
  if(!pendingBets||!pendingBets.length) return;
  for(const bet of pendingBets){
    const won=bet.picked===winner;
    await db.from('bets').update({status:won?'won':'lost'}).eq('id',bet.id);
    if(won&&currentUser&&bet.player_id===currentUser.id){
      currentUser.balance+=bet.potential_win;
      await db.from('players').update({balance:currentUser.balance}).eq('id',currentUser.id);
      updateBalance();
    }
  }
  loadMyBets();
}

// ── MY BETS ──
async function loadMyBets(){
  if(!currentUser) return;
  const{data}=await db.from('bets').select('*').eq('player_id',currentUser.id).order('created_at',{ascending:false}).limit(20);
  currentBets=data||[];renderMyBets();
}

function isBetCancellable(bet){
  if(bet.status!=='pending') return false;
  if(!tournament) return false;
  const ri=bet.round_index;
  if(ri==null) return false;
  const state=tournament.roundStates?.[ri]||'open';
  return state==='open'||state==='displayed';
}

function renderMyBets(){
  const el=document.getElementById('bets-list');
  el.innerHTML=currentBets.length
    ?currentBets.map((b,idx)=>{
      const cancellable=isBetCancellable(b);
      return `<div class="bet-card">
        <div class="bet-card-info">
          <div class="bet-card-match">${b.match_name}</div>
          <div class="bet-card-pick">Picked: <strong>${b.picked}</strong> · ${b.odds}x · Win: 🪙 ${b.potential_win.toLocaleString()}</div>
        </div>
        <div class="bet-card-meta">
          <div class="bet-card-amount">🪙 ${b.amount.toLocaleString()}</div>
          <div class="bet-card-status status-${b.status}">${b.status}</div>
          ${cancellable?`<button class="btn-cancel-bet" onclick="cancelBet(${idx})">✕ Cancel</button>`:''}
        </div>
      </div>`;
    }).join('')
    :'<div class="empty-state">⚔ No bets placed yet. Head to the Arena!</div>';
}

async function cancelBet(idx){
  const bet=currentBets[idx];
  if(!bet){alert('Bet not found.');return;}
  if(!confirm('Cancel this bet and get your gold refunded?')) return;
  console.log('Cancelling bet id:',bet.id,'type:',typeof bet.id);
  const{error}=await db.from('bets')
    .update({status:'cancelled'})
    .eq('id',bet.id)
    .eq('player_id',currentUser.id)
    .eq('status','pending');
  if(error){
    console.error('Cancel bet error:',error);
    alert('Could not cancel bet: '+error.message);
    return;
  }
  currentUser.balance+=bet.amount;
  await db.from('players').update({balance:currentUser.balance}).eq('id',currentUser.id);
  updateBalance();
  await loadMyBets();
}

// ── LEADERBOARD ──
async function renderLeaderboard(){
  const el=document.getElementById('lb-rows');
  if(!el) return;

  // ── Tournament standings block ──
  const tournamentBlock=document.getElementById('lb-tournament-block');
  const tournamentTable=document.getElementById('lb-tournament-table-body');
  if(tournament&&tournamentTable){
    tournamentBlock.style.display='block';
    const sorted=[...tournament.table].sort((a,b)=>b.pts-a.pts||b.w-a.w||(b.w-b.l)-(a.w-a.l));
    tournamentTable.innerHTML=sorted.map((p,i)=>`
      <tr class="rank-${i+1}">
        <td><span class="rank-num">${i+1}</span></td>
        <td><div class="player-name-cell">${p.name}</div>${p.crTag?`<div class="player-cr-tag">${p.crTag}</div>`:''}</td>
        <td>${p.p}</td><td>${p.w}</td><td>${p.d}</td><td>${p.l}</td>
        <td><span class="pts-cell">${p.pts}</span></td>
      </tr>`).join('');
  } else if(tournamentBlock){
    tournamentBlock.style.display='none';
  }

  // ── Global gold rankings ──
  const{data:players,error}=await db.from('players').select('username,wins,balance').order('balance',{ascending:false}).limit(50);
  if(error||!players||!players.length){
    el.innerHTML='<div class="empty-state" style="padding:2rem">No players yet.</div>';return;
  }
  const rc=['gold','silver','bronze'],re=['♛','♜','♝'];
  el.innerHTML=players.map((p,i)=>`
    <div class="lb-row">
      <span class="lb-rank ${rc[i]||''}">${re[i]||i+1}</span>
      <div class="lb-player" style="display:flex;align-items:center;gap:.6rem">
        <div class="nav-avatar" style="width:28px;height:28px;font-size:.75rem">${p.username.slice(0,2).toUpperCase()}</div>
        <span class="lb-name">${p.username}</span>
      </div>
      <span class="lb-wins">${p.wins||0}W</span>
      <span class="lb-gold">${(p.balance||0).toLocaleString()}</span>
    </div>`).join('');
}

// ── UTILITIES ──
function switchTab(tab){
  document.getElementById('signin-form').style.display=tab==='signin'?'block':'none';
  document.getElementById('signup-form').style.display=tab==='signup'?'block':'none';
  document.getElementById('tab-signin').classList.toggle('active',tab==='signin');
  document.getElementById('tab-signup').classList.toggle('active',tab==='signup');
}
function showError(prefix,msg){const el=document.getElementById(`${prefix}-error`);if(el){el.textContent=msg;el.style.display='block';}}
function showSuccess(prefix,msg){const el=document.getElementById(`${prefix}-success`);if(el){el.textContent=msg;el.style.display='block';}}
function clearMessages(prefix){['error','success'].forEach(t=>{const el=document.getElementById(`${prefix}-${t}`);if(el) el.style.display='none';});}
function togglePw(inputId,btn){const input=document.getElementById(inputId);input.type=input.type==='password'?'text':'password';btn.style.opacity=input.type==='text'?'1':'0.4';}
document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;document.getElementById('signup-form').style.display!=='none'?signUp():signIn();});
