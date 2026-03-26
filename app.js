const SUPABASE_URL='https://tpxlduvtocvasxqpmqom.supabase.co',SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRweGxkdXZ0b2N2YXN4cXBtcW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTE5OTAsImV4cCI6MjA4OTI4Nzk5MH0.bKtk8DiPI5RVX-DYirjSkicjzELiryHsp9v6Hyi17KM';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_ANON);
let currentUser=null,currentBets=[],activeBetData={};

const MATCHES=[
  {id:1,league:'Grand Champions',live:true,p1:{name:'KingSlayer99',avatar:'⚔️',rank:'#4 Global',odds:1.8},p2:{name:'DragonRider',avatar:'🐉',rank:'#7 Global',odds:2.1}},
  {id:2,league:'Ultimate Champion',live:true,p1:{name:'RocketQueen',avatar:'🚀',rank:'#12 Global',odds:2.4},p2:{name:'WallBreaker',avatar:'💥',rank:'#9 Global',odds:1.6}},
  {id:3,league:'Legend League',live:false,p1:{name:'GoblinKing',avatar:'👺',rank:'#21 Global',odds:1.5},p2:{name:'IceWizard',avatar:'🧊',rank:'#18 Global',odds:2.6}},
  {id:4,league:'Pro Series',live:true,p1:{name:'ElixirPump',avatar:'💜',rank:'#33 Global',odds:3.0},p2:{name:'P.E.K.K.A',avatar:'🤖',rank:'#5 Global',odds:1.4}},
  {id:5,league:'Grand Champions',live:false,p1:{name:'SparkMaster',avatar:'⚡',rank:'#15 Global',odds:1.9},p2:{name:'MegaKnight',avatar:'🛡️',rank:'#11 Global',odds:1.9}},
  {id:6,league:'Ultimate Champion',live:true,p1:{name:'BabyDragon',avatar:'🔥',rank:'#27 Global',odds:2.2},p2:{name:'InfernoDragon',avatar:'🌋',rank:'#8 Global',odds:1.7}},
];

const LEADERBOARD=[
  {username:'KingSlayer99',wins:47,balance:24800},{username:'DragonRider',wins:39,balance:19200},
  {username:'RocketQueen',wins:35,balance:15600},{username:'MegaKnight',wins:31,balance:12400},
  {username:'IceWizard',wins:28,balance:10900},{username:'GoblinKing',wins:22,balance:8700},
  {username:'SparkMaster',wins:19,balance:7200},{username:'WallBreaker',wins:14,balance:5500},
];

window.addEventListener('DOMContentLoaded',async()=>{
  const{data:{session}}=await db.auth.getSession();
  if(session)await loadUserProfile(session.user.id);
  renderMatches();renderLeaderboard();
});

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
  if(existing){showError('signup','That username is already taken. Choose another.');btn.disabled=false;btn.querySelector('span').textContent='Join the Arena';return;}
  const{data:authData,error:authError}=await db.auth.signUp({email:`${username}@royalbet.gg`,password});
  if(authError){showError('signup',authError.message);btn.disabled=false;btn.querySelector('span').textContent='Join the Arena';return;}
  const{error:profileError}=await db.from('players').insert({id:authData.user.id,username,balance:1000,wins:0});
  btn.disabled=false;btn.querySelector('span').textContent='Join the Arena';
  if(profileError)showError('signup','Account created but profile setup failed. Please sign in.');
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
  showSection('home');loadMyBets();
}

function updateBalance(){document.getElementById('nav-balance').textContent=currentUser.balance.toLocaleString();}

function showSection(name){
  ['home','bets','leaderboard'].forEach(s=>document.getElementById(`section-${s}`).style.display=s===name?'block':'none');
  document.querySelectorAll('.nav-link').forEach((el,i)=>el.classList.toggle('active',i===['home','bets','leaderboard'].indexOf(name)));
}

function renderMatches(){
  document.getElementById('matches-grid').innerHTML=MATCHES.map(m=>`
    <div class="match-card"><div class="match-header"><span class="match-league">⚔ ${m.league}</span>${m.live?'<span class="match-live"><span class="live-dot"></span> Live</span>':'<span style="font-size:11px;color:var(--muted)">Upcoming</span>'}</div>
    <div class="match-body"><div class="match-players">${[m.p1,m.p2].map(p=>`<div class="player"><div class="player-avatar" style="background:var(--bg3)">${p.avatar}</div><div class="player-name">${p.name}</div><div class="player-rank">${p.rank}</div></div>`).join('<div class="vs-badge">VS</div>')}</div>
    <div class="match-odds">${[m.p1,m.p2].map((p,i)=>`<button class="odds-btn" onclick="openBetModal(${m.id},${i+1})"><div class="odds-player">${p.name}</div><div class="odds-value">${p.odds}x</div></button>`).join('')}</div></div></div>
  `).join('');
}

function openBetModal(matchId,side){
  if(!currentUser){showError('signin','Please sign in to place bets.');return;}
  const match=MATCHES.find(m=>m.id===matchId);
  activeBetData={match,side,player:side===1?match.p1:match.p2};
  document.getElementById('modal-match-info').textContent=`${match.p1.name} vs ${match.p2.name}`;
  document.getElementById('modal-sides').innerHTML=[match.p1,match.p2].map((p,i)=>`<button class="side-btn ${side===i+1?'selected':''}" onclick="selectSide(${i+1})">${p.avatar} ${p.name}<br><span style="color:var(--gold);font-size:13px">${p.odds}x odds</span></button>`).join('');
  document.getElementById('bet-balance-hint').textContent=`Your balance: 🪙 ${currentUser.balance.toLocaleString()}`;
  document.getElementById('bet-amount').value='';
  document.getElementById('bet-modal').style.display='flex';
}

function selectSide(side){
  activeBetData.side=side;activeBetData.player=side===1?activeBetData.match.p1:activeBetData.match.p2;
  document.querySelectorAll('.side-btn').forEach((btn,i)=>btn.classList.toggle('selected',i+1===side));
}

function closeBetModal(event){
  if(event&&event.target!==document.getElementById('bet-modal'))return;
  document.getElementById('bet-modal').style.display='none';
}

async function confirmBet(){
  const amount=parseInt(document.getElementById('bet-amount').value);
  if(!amount||amount<10){alert('Minimum bet is 🪙 10 gold.');return;}
  if(amount>currentUser.balance){alert('Not enough gold!');return;}
  const btn=document.getElementById('confirm-bet-btn');
  btn.disabled=true;btn.textContent='Placing…';
  currentUser.balance-=amount;
  await db.from('players').update({balance:currentUser.balance}).eq('id',currentUser.id);
  updateBalance();
  const bet={player_id:currentUser.id,match_id:activeBetData.match.id,match_name:`${activeBetData.match.p1.name} vs ${activeBetData.match.p2.name}`,picked:activeBetData.player.name,odds:activeBetData.player.odds,amount,potential_win:Math.round(amount*activeBetData.player.odds),status:'pending'};
  await db.from('bets').insert(bet);
  currentBets.unshift(bet);renderMyBets();
  btn.disabled=false;btn.textContent='Confirm Bet';
  document.getElementById('bet-modal').style.display='none';
}

async function loadMyBets(){
  if(!currentUser)return;
  const{data}=await db.from('bets').select('*').eq('player_id',currentUser.id).order('created_at',{ascending:false}).limit(20);
  currentBets=data||[];renderMyBets();
}

function renderMyBets(){
  const el=document.getElementById('bets-list');
  el.innerHTML=currentBets.length?currentBets.map(b=>`<div class="bet-row"><div class="bet-info"><div class="bet-match">${b.match_name}</div><div class="bet-detail">Picked: <strong>${b.picked}</strong> · ${b.odds}x odds · Win: 🪙 ${b.potential_win.toLocaleString()}</div></div><div class="bet-amount">🪙 ${b.amount.toLocaleString()}</div><div class="bet-status ${b.status}">${b.status}</div></div>`).join(''):'<div class="empty-state">⚔ No bets placed yet. Head to the Arena!</div>';
}

function renderLeaderboard(){
  const rc=['gold-rank','silver-rank','bronze-rank'],re=['♛','♜','♝'];
  document.getElementById('lb-rows').innerHTML=LEADERBOARD.map((p,i)=>`<div class="lb-row"><span class="lb-rank ${rc[i]||''}">${re[i]||i+1}</span><div class="lb-player"><div class="lb-avatar">${p.username.slice(0,2).toUpperCase()}</div><span class="lb-name">${p.username}</span></div><span class="lb-wins">${p.wins}W</span><span class="lb-gold">${p.balance.toLocaleString()}</span></div>`).join('');
}

function switchTab(tab){
  document.getElementById('signin-form').style.display=tab==='signin'?'block':'none';
  document.getElementById('signup-form').style.display=tab==='signup'?'block':'none';
  document.getElementById('tab-signin').classList.toggle('active',tab==='signin');
  document.getElementById('tab-signup').classList.toggle('active',tab==='signup');
}

function showError(prefix,msg){const el=document.getElementById(`${prefix}-error`);if(el){el.textContent=msg;el.style.display='block';}}
function showSuccess(prefix,msg){const el=document.getElementById(`${prefix}-success`);if(el){el.textContent=msg;el.style.display='block';}}
function clearMessages(prefix){['error','success'].forEach(t=>{const el=document.getElementById(`${prefix}-${t}`);if(el)el.style.display='none';});}
function togglePw(inputId,btn){const input=document.getElementById(inputId);input.type=input.type==='password'?'text':'password';btn.style.opacity=input.type==='text'?'1':'0.4';}

document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;document.getElementById('signup-form').style.display!=='none'?signUp():signIn();});
